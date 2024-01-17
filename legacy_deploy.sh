#!/bin/bash
git pull
npm i
npm run validate && npm run build
sudo service repka-gpt restart
sudo service repka-gpt status
