#!/bin/bash

# Optional manual llama.cpp build script.

echo "Cloning llama.cpp..."
if [ ! -d "llama.cpp" ]; then
  git clone https://github.com/ggerganov/llama.cpp
fi

cd llama.cpp || exit 1

echo "Building llama.cpp..."
make

echo "Build complete."
echo "node-llama-cpp should detect compiled llama.cpp automatically."
