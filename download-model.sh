#!/bin/bash

# Download a GGUF model for local LLMa usage.

MODELS_DIR="./models"
MODEL_FILE="$MODELS_DIR/llama.gguf"

mkdir -p "$MODELS_DIR"

# Default: Llama 3.2 1B Instruct Q4_K_M
MODEL_URL="${MODEL_URL:-https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf}"

echo "Downloading GGUF model..."
echo "URL: $MODEL_URL"
echo "Destination: $MODEL_FILE"
echo ""

if ! command -v curl >/dev/null 2>&1; then
  echo "Error: curl not found. Please install curl first."
  exit 1
fi

curl -L -o "$MODEL_FILE" "$MODEL_URL"

if [ $? -eq 0 ] && [ -f "$MODEL_FILE" ]; then
  echo ""
  echo "Model downloaded successfully."
  echo "File: $MODEL_FILE"
  echo "Size: $(du -h "$MODEL_FILE" | cut -f1)"
  echo ""
  echo "Now run: npm start"
else
  echo ""
  echo "Error downloading model. Check your internet connection."
  exit 1
fi
