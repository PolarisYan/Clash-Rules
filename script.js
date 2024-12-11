const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { simpleGit, GitConfigScope } = require('simple-git');

const git = simpleGit();
const listFilePath = './ruleset/file-list.txt';
const localHost = ['127.0.0.1localhost', '::1localhost']
const commitMessage = "Automatically update the rule file";
const branchName = "main";
const gitUserFilePath = path.join(__dirname, 'git_user.json');
const classicalRules = [
  { rule: "DOMAIN", reformatTo: "domain", stashClassical: false },
  { rule: "DOMAIN-SUFFIX", reformatTo: "domain", stashClassical: false },
  { rule: "DOMAIN-KEYWORD", reformatTo: "classical", stashClassical: true },
  { rule: "DOMAIN-REGEX", reformatTo: "classical", stashClassical: false },
  { rule: "GEOSITE", reformatTo: "classical", stashClassical: true },
  { rule: "IP-CIDR", reformatTo: "ipcidr", stashClassical: false },
  { rule: "IP-CIDR6", reformatTo: "ipcidr", stashClassical: false },
  { rule: "IP-SUFFIX", reformatTo: "classical", stashClassical: false },
  { rule: "IP-ASN", reformatTo: "classical", stashClassical: true },
  { rule: "GEOIP", reformatTo: "classical", stashClassical: true },
  { rule: "SRC-GEOIP", reformatTo: "classical", stashClassical: false },
  { rule: "SRC-IP-ASN", reformatTo: "classical", stashClassical: false },
  { rule: "SRC-IP-CIDR", reformatTo: "classical", stashClassical: false },
  { rule: "SRC-IP-SUFFIX", reformatTo: "classical", stashClassical: false },
  { rule: "DST-PORT", reformatTo: "classical", stashClassical: true },
  { rule: "SRC-PORT", reformatTo: "classical", stashClassical: false },
  { rule: "IN-PORT", reformatTo: "classical", stashClassical: false },
  { rule: "IN-TYPE", reformatTo: "classical", stashClassical: false },
  { rule: "IN-USER", reformatTo: "classical", stashClassical: false },
  { rule: "IN-NAME", reformatTo: "classical", stashClassical: false },
  { rule: "PROCESS-PATH", reformatTo: "classical", stashClassical: true },
  { rule: "PROCESS-PATH-REGEX", reformatTo: "classical", stashClassical: false },
  { rule: "PROCESS-NAME", reformatTo: "classical", stashClassical: true },
  { rule: "PROCESS-NAME-REGEX", reformatTo: "classical", stashClassical: false },
  { rule: "UID", reformatTo: "classical", stashClassical: false },
  { rule: "NETWORK", reformatTo: "classical", stashClassical: false },
  { rule: "DSCP", reformatTo: "classical", stashClassical: false },
  { rule: "RULE-SET", reformatTo: "classical", stashClassical: true },
  { rule: "AND & OR & NOT", reformatTo: "classical", stashClassical: false },
  { rule: "SUB-RULE", reformatTo: "classical", stashClassical: false },
  { rule: "MATCH", reformatTo: "classical", stashClassical: false },
]

async function ensureDirectoryExists(dirPath) {
  try {
    await fs.promises.access(dirPath);
  } catch (err) {
    if (err.code === 'ENOENT') {
      await fs.promises.mkdir(dirPath, { recursive: true });
    } else {
      throw err;
    }
  }
}

async function downloadFile(url, dest) {
  const downloadFileConfig = {
    url, method: 'GET', responseType: 'stream'
  };
  try {
    const response = await axios(downloadFileConfig);
    const destDir = path.dirname(dest);
    await ensureDirectoryExists(destDir);
    const fileStream = fs.createWriteStream(dest);
    await new Promise((resolve, reject) => {
      response.data.pipe(fileStream);
      response.data.on('error', reject);
      fileStream.on('error', reject);
      fileStream.on('finish', resolve);
    });
    console.log(`File downloaded successfully from ${url} to ${dest}`);
    return dest;
  } catch (error) {
    console.error(`Error downloading file from ${url} to ${dest}:`, error);
    return null;
  }
}

async function copyFileToClashDir(src) {
  if (!src) {
    console.error(`Source file path is undefined or null: ${src}`);
    return;
  }

  const srcDir = path.dirname(src);
  const parentDir = path.dirname(srcDir);

  const clashDir = path.join(parentDir, 'clash');
  const clashDest = path.join(clashDir, 'text_domain_plus_wildcard.txt');
  try {
    await ensureDirectoryExists(clashDir);
  } catch (error) {
    console.error(`Error ensuring directory exists for ${clashDir}:`, error);
    return;
  }

  const stashDir = path.join(parentDir, 'stash');
  const stashDest = path.join(stashDir, 'text_domain_dot_wildcard.txt');
  try {
    await ensureDirectoryExists(stashDir);
  } catch (error) {
    console.error(`Error ensuring directory exists for ${stashDest}:`, error);
    return;
  }

  function checkIfClassical(fileContent) {
    return fileContent
      .split('\n')
      .map(line => line.replace(/\s+/g, ''))
      .filter(line => line.length > 0 && !line.startsWith('#'))
      .findIndex(line => {
        return classicalRules.some(classicalRule => line.includes(classicalRule.rule + ","));
      }) !== -1;
  }

  try {
    const fileContent = await fs.promises.readFile(src, 'utf8');
    if (!fileContent) {
      console.error(`File content is empty: ${src}`);
      return;
    }

    if (checkIfClassical(fileContent)) {
      const {
        domainContentClash,
        domainContentStash,
        ipcidrContent,
        classicalContentClash,
        classicalContentStash
      } = splitClassicalToDifferentContentTypes(fileContent);
      if (domainContentClash) {
        await writeFile(clashDest, domainContentClash);
        console.log(`File copied and modified successfully to ${clashDest}`);
      }
      if (domainContentStash) {
        await writeFile(stashDest, domainContentStash);
        console.log(`File copied and modified successfully to ${stashDest}`);
      }
      if (ipcidrContent) {
        const ipcidrDir = path.join(parentDir, 'ipcidr');
        const ipcidrDest = path.join(ipcidrDir, 'text_ipcidr.txt');
        await ensureDirectoryExists(ipcidrDir);
        await writeFile(ipcidrDest, ipcidrContent);
        console.log(`File copied and modified successfully to ${ipcidrDest}`);
      }
      if (classicalContentClash) {
        const classicalClashDest = path.join(clashDir, 'text_classical.txt');
        await writeFile(classicalClashDest, classicalContentClash);
        console.log(`File copied and modified successfully to ${classicalClashDest}`);
      }
      if (classicalContentStash) {
        const classicalStashDest = path.join(stashDir, 'text_classical.txt');
        await writeFile(classicalStashDest, classicalContentStash);
        console.log(`File copied and modified successfully to ${classicalStashDest}`);
      }
    } else {
      const modifiedContentClash = modifyFileContentWithWildcard(fileContent, "+.");
      await writeFile(clashDest, modifiedContentClash);
      console.log(`File copied and modified successfully to ${clashDest}`);

      const modifiedContentStash = modifyFileContentWithWildcard(fileContent, ".");
      await writeFile(stashDest, modifiedContentStash);
      console.log(`File copied and modified successfully to ${stashDest}`);
    }
  } catch (error) {
    console.error(`Error copying or modifying file to clash directory from ${src}:`, error);
  }
}

async function writeFile(filePath, content) {
  await fs.promises.writeFile(filePath, content, 'utf8');
  console.log(`File created: ${filePath}`);

  const dir = path.dirname(filePath);
  const files = await fs.promises.readdir(dir);
  for (const file of files) {
    if (/_\d+\./.test(file)) {
      const filePath = path.join(dir, file);
      await fs.promises.unlink(filePath);
      console.log(`Deleted file: ${filePath}`);
    }
  }
  const lines = content.split('\n');
  const lineCountsPerFile = 99999;
  if (lines.length > lineCountsPerFile) {
    const dir = path.dirname(filePath);
    const extname = path.extname(filePath);
    const baseName = path.basename(filePath, extname);
    let newFilePath = dir;
    let counter = 0;

    for (let i = 0; i < lines.length; i++) {
      if (i % lineCountsPerFile === 0 && (newFilePath = path.join(dir, `${baseName}_${counter}${extname}`))) {
        let end = i + lineCountsPerFile > lines.length ? lines.length : i + lineCountsPerFile;
        content = lines.slice(i, end).join('\n');
        await fs.promises.writeFile(newFilePath, content, 'utf8');
        console.log(`File created: ${newFilePath}`);
        counter++;
      }
    }
  }
}

function splitClassicalToDifferentContentTypes(content) {
  var domainContentClash = "",
    domainContentStash = "",
    ipcidrContent = "",
    classicalContentClash = "",
    classicalContentStash = "";
  content
    .split('\n')
    .map(line => line.replace(/\s+/g, ''))
    .filter(line => line.length > 0 && !line.startsWith('#') && !line.startsWith('payload:'))
    .forEach(line => {
      line = line.startsWith('-') ? line.substring(1) : line
      const matchedRule = classicalRules.find(rule => line.startsWith(rule.rule + ","))
      if (!matchedRule) {
        return;
      }
      if (matchedRule.reformatTo === "ipcidr") {
        ipcidrContent = ipcidrContent.concat(line.split(",")[1]).concat("\n");
      } else if (matchedRule.reformatTo === "domain") {
        const lineToContent = line.split(",")[1].concat("\n");
        domainContentClash = domainContentClash.concat("+.".concat(lineToContent));
        domainContentStash = domainContentStash.concat(".".concat(lineToContent));
      } else {
        classicalContentClash = classicalContentClash.concat(line).concat("\n");
        if (matchedRule.stashClassical) {
          classicalContentStash = classicalContentStash.concat(line).concat("\n");
        }
      }
    })

  domainContentClash = domainContentClash.endsWith("\n") ?
    domainContentClash.substring(0, domainContentClash.length - 1) : domainContentClash;
  domainContentStash = domainContentStash.endsWith("\n") ?
    domainContentStash.substring(0, domainContentStash.length - 1) : domainContentStash;
  ipcidrContent = ipcidrContent.endsWith("\n") ?
    ipcidrContent.substring(0, ipcidrContent.length - 1) : ipcidrContent;
  classicalContentClash = classicalContentClash.endsWith("\n") ?
    classicalContentClash.substring(0, classicalContentClash.length - 1) : classicalContentClash;
  classicalContentStash = classicalContentStash.endsWith("\n") ?
    classicalContentStash.substring(0, classicalContentStash.length - 1) : classicalContentStash;

  return { domainContentClash, domainContentStash, ipcidrContent, classicalContentClash, classicalContentStash }
}

function modifyFileContentWithWildcard(content, wildcard) {
  return content
    .split('\n')
    .map(line => line.replace(/\s+/g, ''))
    .filter(line => line.length > 0 && !line.startsWith('#') && !line.startsWith('payload:') && !localHost.includes(line))
    .map(line => {
      if (line.startsWith("0.0.0.0")) {
        line = line.substring("0.0.0.0".length);
      } else if (line.startsWith("127.0.0.1")) {
        line = line.substring("127.0.0.1".length);
      }
      if (line.startsWith("-'") && line.endsWith("'")) {
        line = line.substring(2, line.length - 1);
      }
      if (line.startsWith(wildcard)) {
      } else if (line.startsWith("+.") || line.startsWith("*.")) {
        line = line.substring(2, line.length);
      } else if (line.startsWith(".") || line.startsWith("*")) {
        line = line.substring(1, line.length);
      }
      if (/\b((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\/(3[0-2]|[12]?[0-9]))?\b/.test(line)) {
        return line;
      } else if (/\b(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))(\/(12[0-8]|1[01][0-9]|[1-9]?[0-9]))?\b/.test(line)) {
        return line;
      } else {
        return line.startsWith(wildcard) ? line : `${wildcard}${line}`
      }
    })
    .join('\n');
}

async function readDownloadList(filePath) {
  try {
    console.log(`Reading download list from ${listFilePath}`);
    const data = await fs.promises.readFile(filePath, 'utf8');
    if (!data) {
      throw new Error(`File content is empty: ${filePath}`);
    }
    return data.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('//'))
      .map(line => line.split(','))
      .map(([url, dest]) => ({ url, dest }));
  } catch (error) {
    console.error(`Error reading download list from ${filePath}:`, error);
    throw error;
  }
}

async function gitCommitAndPush(commitMessage, branchName, repoUrl, username, token) {
  try {
    const authRepoUrlWithCreds = `https://${username}:${token}@${repoUrl.replace(/^https?:\/\//, '')}`;

    await git.addConfig('user.name', 'Polaris', false, GitConfigScope.local);
    await git.addConfig('user.email', 'PolarisYan02@outlook.com', false, GitConfigScope.local);

    await git.add('./ruleset');
    console.log('Files in ./ruleset directory added to staging area.');

    await git.commit(commitMessage);
    console.log('Changes committed.');

    console.log('Push to ', authRepoUrlWithCreds);
    await git.push(authRepoUrlWithCreds, branchName);
    console.log('Changes pushed to remote repository.');
  } catch (error) {
    console.error('Error during Git operations:', error);
  }
}

async function readGitUserCredentials() {
  try {
    console.log(`Attempting to read git user credentials from ${gitUserFilePath}`);
    const data = await fs.promises.readFile(gitUserFilePath, 'utf8');
    console.log(`Successfully read git user credentials from ${gitUserFilePath}`);
    const parsedData = JSON.parse(data);
    console.log(`Parsed git user credentials data:`, parsedData);
    return parsedData;
  } catch (error) {
    console.error(`Error reading gituser.json from ${gitUserFilePath}:`, error);
    throw error;
  }
}

async function getRemoteUrl() {
  try {
    console.log('Attempting to get remote URL');
    const remotes = await git.getRemotes(true);
    console.log('Retrieved remotes:', remotes);
    if (remotes.length === 0) {
      throw new Error('No remote configured for this repository.');
    }
    const remoteUrl = remotes[0].refs.push;
    console.log('Selected remote URL:', remoteUrl);
    return remoteUrl;
  } catch (error) {
    console.error('Error getting remote URL:', error);
    throw error;
  }
}

async function main() {
  try {
    const downloadList = await readDownloadList(listFilePath);
    const repoUrl = await getRemoteUrl();
    const { username, token } = await readGitUserCredentials();
    console.log(`\n\n\n`);

    for (const { url, dest } of downloadList) {
      console.log(`Downloading file from ${url} to ${dest}`);
      const downloadedFilePath = await downloadFile(url, dest);
      if (downloadedFilePath) {
        console.log(`Copying and modifying file from ${downloadedFilePath}`);
        await copyFileToClashDir(downloadedFilePath);
      } else {
        console.error(`Failed to download file from ${url} to ${dest}`);
      }
      console.log(``);
    }
    console.log(`\n\n\n`);
    await gitCommitAndPush(commitMessage, branchName, repoUrl, username, token);
    console.log(`\n\n\n`);
  } catch (error) {
    console.error('Failed to process download list:', error);
  }
}

(async () => {
  try {
    await main();
  } catch (error) {
    console.error('Failed to execute main function:', error);
  }
})();
