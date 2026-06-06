import type { Toolkit, ToolkitConfig, SendReplyArgs } from './types.js';
import { route } from './boundary.js';
import { createSdkClient, sdkReply } from './sdk-client.js';
import { cliApi } from './cli-bridge.js';

export function createToolkit(cfg: ToolkitConfig): Toolkit {
  const sdkClient = createSdkClient(cfg);
  return {
    async reply(args: SendReplyArgs): Promise<void> {
      const channel = route('im.v1.message.create');
      if (channel === 'sdk') {
        await sdkReply(sdkClient, args);
      } else {
        await cliApi('im.v1.message.create', {
          receive_id_type: 'chat_id',
          receive_id: args.chatId,
          msg_type: 'text',
          content: JSON.stringify({ text: args.text }),
        });
      }
    },
  };
}

export type { Toolkit, ToolkitConfig, SendReplyArgs } from './types.js';
export { CliBridgeError } from './types.js';
export { buildLarkToolkitAdapterDescriptor } from './hub.js';
