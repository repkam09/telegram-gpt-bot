#!/bin/bash
set -e

ollama create repkam09/hennos-qwen3.5:9b -f ./hennos-qwen3.5-9b/Modelfile
ollama create repkam09/hennos-qwen3.5:4b -f ./hennos-qwen3.5-4b/Modelfile
ollama create repkam09/hennos-qwen3.5:2b -f ./hennos-qwen3.5-2b/Modelfile
ollama create repkam09/hennos-qwen3.5:0.8b -f ./hennos-qwen3.5-0.8b/Modelfile
