const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ipaddr = require('ipaddr.js');
const { simpleGit, GitConfigScope } = require('simple-git');

const git = simpleGit();
const listFilePath = './ruleset/file-list.txt';
const localHost = ['127.0.0.1localhost', '::1localhost']
const commitMessage = "Automatically update the rule file";
const branchName = "main";
const gitUserFilePath = path.join(__dirname, 'git_user.json');
const mergeRulesFilePath = './ruleset/merge-rules.json';
const classicalRules = [
  { rule: "DOMAIN", reformatTo: "domain", stashClassical: false, mergeFunc: null }, // TODO: mergeFunc
  { rule: "DOMAIN-SUFFIX", reformatTo: "domain", stashClassical: false, mergeFunc: null }, // TODO: mergeFunc
  { rule: "DOMAIN-KEYWORD", reformatTo: "classical", stashClassical: true, mergeFunc: null }, // TODO: mergeFunc
  { rule: "DOMAIN-REGEX", reformatTo: "classical", stashClassical: false, mergeFunc: null }, // TODO: mergeFunc
  { rule: "GEOSITE", reformatTo: "classical", stashClassical: true, mergeFunc: null }, // TODO: mergeFunc
  { rule: "IP-CIDR", reformatTo: "ipcidr", stashClassical: false, mergeFunc: null }, // TODO: mergeFunc
  { rule: "IP-CIDR6", reformatTo: "ipcidr", stashClassical: false, mergeFunc: null }, // TODO: mergeFunc
  { rule: "IP-SUFFIX", reformatTo: "classical", stashClassical: false, mergeFunc: null }, // TODO: mergeFunc
  { rule: "IP-ASN", reformatTo: "classical", stashClassical: true, mergeFunc: null }, // TODO: mergeFunc
  { rule: "GEOIP", reformatTo: "classical", stashClassical: true, mergeFunc: null }, // TODO: mergeFunc
  { rule: "SRC-GEOIP", reformatTo: "classical", stashClassical: false, mergeFunc: null }, // TODO: mergeFunc
  { rule: "SRC-IP-ASN", reformatTo: "classical", stashClassical: false, mergeFunc: null }, // TODO: mergeFunc
  { rule: "SRC-IP-CIDR", reformatTo: "classical", stashClassical: false, mergeFunc: null }, // TODO: mergeFunc
  { rule: "SRC-IP-SUFFIX", reformatTo: "classical", stashClassical: false, mergeFunc: null }, // TODO: mergeFunc
  { rule: "DST-PORT", reformatTo: "classical", stashClassical: true, mergeFunc: null }, // TODO: mergeFunc
  { rule: "SRC-PORT", reformatTo: "classical", stashClassical: false, mergeFunc: null }, // TODO: mergeFunc
  { rule: "IN-PORT", reformatTo: "classical", stashClassical: false, mergeFunc: null }, // TODO: mergeFunc
  { rule: "IN-TYPE", reformatTo: "classical", stashClassical: false, mergeFunc: null }, // TODO: mergeFunc
  { rule: "IN-USER", reformatTo: "classical", stashClassical: false, mergeFunc: null }, // TODO: mergeFunc
  { rule: "IN-NAME", reformatTo: "classical", stashClassical: false, mergeFunc: null }, // TODO: mergeFunc
  { rule: "PROCESS-PATH", reformatTo: "classical", stashClassical: true, mergeFunc: null }, // TODO: mergeFunc
  { rule: "PROCESS-PATH-REGEX", reformatTo: "classical", stashClassical: false, mergeFunc: null }, // TODO: mergeFunc
  { rule: "PROCESS-NAME", reformatTo: "classical", stashClassical: true, mergeFunc: null }, // TODO: mergeFunc
  { rule: "PROCESS-NAME-REGEX", reformatTo: "classical", stashClassical: false, mergeFunc: null }, // TODO: mergeFunc
  { rule: "UID", reformatTo: "classical", stashClassical: false, mergeFunc: null }, // TODO: mergeFunc
  { rule: "NETWORK", reformatTo: "classical", stashClassical: false, mergeFunc: null }, // TODO: mergeFunc
  { rule: "DSCP", reformatTo: "classical", stashClassical: false, mergeFunc: null }, // TODO: mergeFunc
  { rule: "RULE-SET", reformatTo: "classical", stashClassical: true, mergeFunc: null }, // TODO: mergeFunc
  { rule: "AND & OR & NOT", reformatTo: "classical", stashClassical: false, mergeFunc: null }, // TODO: mergeFunc
  { rule: "SUB-RULE", reformatTo: "classical", stashClassical: false, mergeFunc: null }, // TODO: mergeFunc
  { rule: "MATCH", reformatTo: "classical", stashClassical: false, mergeFunc: null }, // TODO: mergeFunc
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

async function deleteSplitFiles(dir, baseName) {
  const files = await fs.promises.readdir(dir);
  for (const file of files) {
    if (/_\d+\./.test(file) && file.includes(baseName)) {
      const filePath = path.join(dir, file);
      await fs.promises.unlink(filePath);
      console.log(`Deleted file: ${filePath}`);
    }
  }
}

async function writeFile(filePath, content) {
  await fs.promises.writeFile(filePath, content, 'utf8');
  console.log(`File created: ${filePath}`);

  const dir = path.dirname(filePath);
  const extname = path.extname(filePath);
  const baseName = path.basename(filePath, extname);
  await deleteSplitFiles(dir, baseName);
  const lines = content.split('\n');
  const lineCountsPerFile = 99999;
  if (lines.length > lineCountsPerFile) {
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
      line = cleanLine(line);
      if (/\b((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\/(3[0-2]|[12]?[0-9]))?\b/.test(line)) {
        return line;
      } else if (/\b(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))(\/(12[0-8]|1[01][0-9]|[1-9]?[0-9]))?\b/.test(line)) {
        return line;
      } else {
        return `${wildcard}${line}`
      }
    })
    .join('\n');
}

function cleanLine(line) {
  if (line.startsWith("0.0.0.0") && !line.includes("/")) {
    line = line.substring("0.0.0.0".length);
  } else if (line.startsWith("127.0.0.1") && !line.includes("/")) {
    line = line.substring("127.0.0.1".length);
  }
  if (line.startsWith("-'") && line.endsWith("'")) {
    line = line.substring(2, line.length - 1);
  }
  if (line.startsWith("+.") || line.startsWith("*.")) {
    line = line.substring(2, line.length);
  } else if (line.startsWith(".") || line.startsWith("*")) {
    line = line.substring(1, line.length);
  }
  return line;
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
    console.error(`Error reading git user credentials data from ${gitUserFilePath}:`, error);
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

async function mergeRules() {
  let mergeRulesList;
  try {
    console.log(`Attempting to read merge rules from ${mergeRulesFilePath}`);
    const data = await fs.promises.readFile(mergeRulesFilePath, 'utf8');
    console.log(`Successfully read merge rules from ${mergeRulesFilePath}`);
    mergeRulesList = JSON.parse(data);
    console.log(`Parsed merge rules  data:`, mergeRulesList);
  } catch (error) {
    console.error(`Error reading merge rules from ${mergeRulesFilePath}:`, error);
    throw error;
  }

  for (let i in mergeRulesList) {
    console.log()
    const each = mergeRulesList[i];
    const clashPlusWildcardTargetFile = each?.targetFiles?.clashPlusWildcard;
    console.log(`clashPlusWildcardTargetFile:`, clashPlusWildcardTargetFile);
    const stashDotWildcardTargetFile = each?.targetFiles?.stashDotWildcard;
    console.log(`stashDotWildcardTargetFile:`, stashDotWildcardTargetFile);
    const sourceDomainFiles = each?.sourceDomainFiles;
    console.log(`sourceDomainFiles:`, sourceDomainFiles);
    console.log()
    const ipcidrTargetFile = each?.targetFiles?.ipcidr;
    console.log(`ipcidrTargetFile:`, ipcidrTargetFile);
    const sourceIpcidrFiles = each?.sourceIpcidrFiles;
    console.log(`sourceIpcidrFiles:`, sourceIpcidrFiles);
    console.log()
    const classicalTargetFile = each?.targetFiles?.classical;
    console.log(`classicalTargetFile:`, classicalTargetFile);
    const sourceClassicalFiles = each?.sourceClassicalFiles;
    console.log(`sourceClassicalFiles:`, sourceClassicalFiles);

    function defaultSort() {
      return (a, b) => a.length === b.length ? a.localeCompare(b) : a.length - b.length
    }

    let mergedClassical
    if (sourceClassicalFiles && classicalTargetFile) {
      console.log();
      console.log(`sourceClassicalFiles:`, sourceClassicalFiles);
      console.log(`classicalTargetFile:`, classicalTargetFile);
      mergedClassical = await mergeFile([{ targetFile: classicalTargetFile }],
        sourceClassicalFiles, mergeClassical, (a, b) => a.localeCompare(b));
    }
    if (sourceDomainFiles && (clashPlusWildcardTargetFile || stashDotWildcardTargetFile)) {
      console.log();
      console.log(`sourceDomainFiles:`, sourceDomainFiles);
      console.log(`clashPlusWildcardTargetFile:`, clashPlusWildcardTargetFile);
      console.log(`stashDotWildcardTargetFile:`, stashDotWildcardTargetFile);
      await mergeFile([{ targetFile: clashPlusWildcardTargetFile, wildcard: "+." },
          { targetFile: stashDotWildcardTargetFile, wildcard: "." }],
        sourceDomainFiles, mergeDomain, defaultSort(),
        mergedClassical);
    }
    if (sourceIpcidrFiles && ipcidrTargetFile) {
      console.log();
      console.log(`sourceIpcidrFiles:`, sourceIpcidrFiles);
      console.log(`ipcidrTargetFile:`, ipcidrTargetFile);
      await mergeFile([{ targetFile: ipcidrTargetFile }],
        sourceIpcidrFiles, mergeIpcidr, defaultSort(),
        mergedClassical);
    }
  }
}

async function mergeFile(targetFiles, sourceFiles, mergeFunc, sortFunc, mergedClassical) {
  const mergedLines = [];
  for (let i in sourceFiles) {
    const eachSourceFile = sourceFiles[i];
    if (!eachSourceFile) {
      continue;
    }
    console.log(`eachSourceFile:`, eachSourceFile);
    let fileContent;
    try {
      fileContent = await fs.promises.readFile(eachSourceFile, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.warn(`File not found: ${eachSourceFile}. Skipping...`);
      } else {
        console.error(`Error reading file ${eachSourceFile}:`, error);
      }
      continue;
    }
    const lines = fileContent.split('\n')
      .map(cleanLine);
    console.log(`Start merge source:`, eachSourceFile);
    lines.forEach(line => {
      let needAdd = true;
      // TODO: Too slow
      // for (let i = 0; i < mergedLines.length; i++) {
      //   const result = mergeFunc(line, mergedLines[i]);
      //   needAdd = result.needAdd;
      //   const needReplace = result.needReplace;
      //   if (needReplace) {
      //     mergedLines[i] = line;
      //   }
      //   if (!needAdd) {
      //     break;
      //   }
      // }
      if (needAdd) {
        mergedLines.push(line);
      }
    });
    console.log(`Merge complete source:`, eachSourceFile);
  }
  console.log(`Merge complete all sources`);
  const uniqueLinesSet = new Set(mergedLines);
  const uniqueLines = Array.from(uniqueLinesSet)
    .filter(line => line && !includeInClassical(line, mergedClassical))
    .sort(sortFunc);

  for (const eachTargetFile of targetFiles) {
    if (!eachTargetFile?.targetFile) {
      continue;
    }
    console.log(`Start write target: `, eachTargetFile?.targetFile);
    const target = path.join(__dirname, eachTargetFile?.targetFile);
    const destDir = path.dirname(target);
    await ensureDirectoryExists(destDir);
    const wildcard = eachTargetFile?.wildcard ?? "";
    await writeFile(target, uniqueLines.map(line => wildcard.concat(line)).join('\n'));
  }
  return uniqueLines;
}

function mergeClassical(newLine, existingLine) {
  // TODO:
  let needAdd = true;
  let needReplace = false;
  return { needAdd, needReplace };
}

function includeInClassical(line, classicalLines) {
  // TODO:
  return false;
}

function mergeDomain(newLine, existingLine) {
  let needAdd = true;
  let needReplace = false;
  if (newLine === existingLine) {
    needAdd = false;
  } else if (newLine.endsWith(".".concat(existingLine))) {
    needAdd = false;
  } else if (existingLine.endsWith(".".concat(newLine))) {
    needReplace = true;
    needAdd = false;
  }
  return { needAdd, needReplace };
}

function mergeIpcidr(newLine, existingLine) {
  let needAdd = true;
  let needReplace = false;

  function isSubnetOf(cidr1, cidr2) {
    const cidr1Addr = ipaddr.parseCIDR(cidr1);
    const cidr2Addr = ipaddr.parseCIDR(cidr2);

    if (cidr1Addr[1] <= cidr2Addr[1]) {
      return false;
    }

    return cidr1Addr[0].match(cidr2Addr);
  }

  if (isSubnetOf(newLine, existingLine)) {
    needAdd = false;
  } else if (isSubnetOf(existingLine, newLine)) {
    needReplace = true;
    needAdd = false;
  }

  return { needAdd, needReplace };
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
    await mergeRules();
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
