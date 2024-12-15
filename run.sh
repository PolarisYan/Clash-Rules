#!/bin/bash

# crontab -e
# 15 4 * * * ./run.sh

#cd local/clash-rules/clash-rules

USERNAME=$(awk -F'"' '/"username"/ {print $4}' ./git_user.json)
TOKEN=$(awk -F'"' '/"token"/ {print $4}' ./git_user.json)

REMOTE_URL=$(git config --get remote.origin.url)

if [[ $REMOTE_URL == git@* ]]; then
    REMOTE_URL="https://${USERNAME}:${TOKEN}@${REMOTE_URL//git@github.com:/github.com/}"
else
    REMOTE_URL="https://${USERNAME}:${TOKEN}@${REMOTE_URL//https:\/\//}"
fi

echo "$REMOTE_URL"

git pull -f "$REMOTE_URL" main

yarn install
yarn node script.js > ../output.log 2>&1
