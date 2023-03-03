#!/bin/bash
sudo service repka-gpt stop
git pull
npm i
sudo service repka-gpt start
sudo service repka-gpt status
