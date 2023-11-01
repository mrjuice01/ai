import {
  type AIStreamCallbacksAndOptions,
  createCallbacksTransformer,
} from './ai-stream';
import { createStreamDataTransformer } from './stream-data';

const utf8Decoder = new TextDecoder('utf-8');

async function processLines(
  lines: string[],
  controller: ReadableStreamDefaultController<string>,
) {
  for (const line of lines) {
    const { text, is_finished } = JSON.parse(line);

    // closing the reader is handed in readAndProcessLines
    if (!is_finished) {
      controller.enqueue(text);
    }
  }
}

async function readAndProcessLines(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  controller: ReadableStreamDefaultController<string>,
) {
  let segment = '';

  while (true) {
    const { value: chunk, done } = await reader.read();
    if (done) {
      break;
    }

    segment += utf8Decoder.decode(chunk, { stream: true });

    const linesArray = segment.split(/\r\n|\n|\r/g);
    segment = linesArray.pop() || '';

    await processLines(linesArray, controller);
  }

  if (segment) {
    const linesArray = [segment];
    await processLines(linesArray, controller);
  }

  controller.close();
}

function createParser(res: Response) {
  const reader = res.body?.getReader();

  return new ReadableStream<string>({
    async start(controller): Promise<void> {
      if (!reader) {
        controller.close();
        return;
      }

      await readAndProcessLines(reader, controller);
    },
  });
}

export function CohereStream(
  reader: Response,
  callbacks?: AIStreamCallbacksAndOptions,
): ReadableStream {
  return createParser(reader)
    .pipeThrough(createCallbacksTransformer(callbacks))
    .pipeThrough(
      createStreamDataTransformer(callbacks?.experimental_streamData),
    );
}
