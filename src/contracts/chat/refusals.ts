/**
 * The reason of a refusal for a write in a channel the caller reads and is not
 * in, as a person reads the channels they are not in. The chat server refuses
 * with it, so that whoever asked can tell this case without reading the message.
 */
export const READ_ONLY = "read_only";
