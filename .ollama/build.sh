#!/bin/bash
set -e

echo "Building hennos-gemma4-e4b"
cd ./hennos-gemma4-e4b
./build.sh
cd ..


echo "Building hennos-gemma4-12b"
cd ./hennos-gemma4-12b
./build.sh
cd ..

echo "Building hennos-codegemma-7b"
cd ./hennos-codegemma-7b
./build.sh
cd ..

echo "Building hennos-cogito-8b"
cd ./hennos-cogito-8b
./build.sh
cd ..

echo "Building hennos-cogito-14b"
cd ./hennos-cogito-14b
./build.sh
cd ..

echo "Building hennos-qwen3.5-0.8b"
cd ./hennos-qwen3.5-0.8b
./build.sh
cd ..

echo "Building hennos-qwen3.5-2b"
cd ./hennos-qwen3.5-2b
./build.sh
cd ..

echo "Building hennos-qwen3.5-4b"
cd ./hennos-qwen3.5-4b
./build.sh
cd ..

echo "Building hennos-qwen3.5-9b"
cd ./hennos-qwen3.5-9b
./build.sh
cd ..

echo "Building hennos-oss-20b"
cd ./hennos-oss-20b
./build.sh
cd ..


