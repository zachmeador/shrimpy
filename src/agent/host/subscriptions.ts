/**
 * Which subscriptions `shrimpy login` offers to sign in to with an account. A
 * subscription is offered only once its vendor's terms have been checked for an
 * app like Shrimpy.
 */

/** The providers whose subscription is offered: OpenAI, for a ChatGPT subscription. */
export const CHECKED_SUBSCRIPTIONS: ReadonlySet<string> = new Set(["openai"]);

/** A subscription that is not offered: what it is called, and why, in words for the person. */
export interface Withheld {
  readonly name: string;
  readonly why: string;
}

const WHY_WITHHELD = new Map<string, string>([
  [
    "anthropic",
    "Anthropic's terms don't let other apps use a Claude subscription. Use an API key instead: Max, Ultra and Team plans include monthly API credits.",
  ],
]);

const NOT_CHECKED = "Shrimpy offers a subscription only once its vendor's terms are checked for an app like it, and this one's aren't yet.";

/** Why the subscription of `provider` is not offered. */
export function whyWithheld(provider: string): string {
  return WHY_WITHHELD.get(provider) ?? NOT_CHECKED;
}
