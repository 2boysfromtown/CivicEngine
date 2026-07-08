class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input[0]) {
      const channelData = input[0];
      // Post PCM float32 samples back to main thread
      this.port.postMessage(channelData);
    }
    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
