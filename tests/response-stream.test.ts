import { describe, expect, it } from "vitest";
import { parseResponsePreviewFromDetail, parseResponseStream } from "../src/response-stream.js";
import type { RequestDetail } from "../src/types.js";

const streamBody = [
  "event: message_start",
  'data: {"type":"message_start","message":{"usage":{"input_tokens":11,"output_tokens":1}}}',
  "",
  "event: content_block_start",
  'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
  "",
  "event: content_block_delta",
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello "}}',
  "",
  "event: content_block_delta",
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"there"}}',
  "",
  "event: content_block_start",
  'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_1","name":"Read","input":{}}}',
  "",
  "event: content_block_delta",
  'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"file_path\\""}}',
  "",
  "event: content_block_delta",
  'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":":\\"src/viewer.ts\\"}"}}',
  "",
  "event: message_delta",
  'data: {"type":"message_delta","usage":{"output_tokens":22}}',
  "",
  "event: message_stop",
  'data: {"type":"message_stop"}',
  ""
].join("\n");

describe("response stream preview", () => {
  it("assembles assistant text tool input usage and events from SSE", () => {
    const preview = parseResponseStream(streamBody);

    expect(preview.stream).toBe(true);
    expect(preview.assistantText).toBe("Hello there");
    expect(preview.toolUses).toEqual([
      {
        index: 1,
        id: "toolu_1",
        name: "Read",
        inputJson: '{"file_path":"src/viewer.ts"}'
      }
    ]);
    expect(preview.usage).toEqual({ inputTokens: 11, outputTokens: 22 });
    expect(preview.events).toHaveLength(9);
    expect(preview.events[0]).toMatchObject({ event: "message_start", type: "message_start" });
    expect(preview.layers).toMatchObject({
      finalText: {
        title: "Final text",
        text: "Hello there",
        chars: 11
      },
      thinking: {
        title: "Thinking",
        text: "",
        chars: 0
      },
      toolUses: [
        {
          title: "Tool use: Read",
          id: "toolu_1",
          name: "Read",
          inputJson: '{"file_path":"src/viewer.ts"}'
        }
      ],
      rawEvents: {
        title: "Raw events",
        eventCount: 9
      },
      rawStream: {
        title: "Raw stream",
        chars: streamBody.length
      }
    });
  });

  it("assembles thinking deltas", () => {
    const preview = parseResponseStream([
      "event: content_block_delta",
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Consider "}}',
      "",
      "event: content_block_delta",
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"tools"}}',
      ""
    ].join("\n"));

    expect(preview.stream).toBe(true);
    expect(preview.thinkingText).toBe("Consider tools");
    expect(preview.layers.thinking.text).toBe("Consider tools");
    expect(preview.layers.thinking.chars).toBe(14);
  });

  it("returns a non-stream preview for plain text", () => {
    const preview = parseResponseStream("plain response");

    expect(preview.stream).toBe(false);
    expect(preview.rawText).toBe("plain response");
    expect(preview.events).toEqual([]);
    expect(preview.layers.finalText.text).toBe("plain response");
    expect(preview.layers.rawEvents.eventCount).toBe(0);
  });

  it("parses stored request detail response body json", () => {
    const detail = {
      payload: {
        responseBodyJson: JSON.stringify(streamBody)
      }
    } as RequestDetail;

    const preview = parseResponsePreviewFromDetail(detail);

    expect(preview.stream).toBe(true);
    expect(preview.assistantText).toBe("Hello there");
  });
});
