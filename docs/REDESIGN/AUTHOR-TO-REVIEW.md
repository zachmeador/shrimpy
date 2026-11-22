# 🦐 For the Author to Review

What is waiting on you, and nothing else. An item is added when a question needs you, or when a build makes a choice that changes the design. An item leaves when you answer it, and its decision moves into the [design](README.md). A small choice a build makes is noted in the message of the commit that made it.

## Waiting on you

**Whether Esc still goes back in the terminal.** [Its mockup](../terminal-mockup.html) has Left go back only from the start of what is typed, so leaving a thread with something typed takes Ctrl+A or Home first. Esc could go back from anywhere.

**The web client's face.** Atkinson Hyperlegible or the system's own. [The web client's mockup](../web-client-mockup.html) has a switch between them at its top.

**Whom a push service is told to write to about your gateway.** Each notification goes through the push service of the browser it is for: Apple's, Google's or Mozilla's. The service can't read it, and with it the gateway says whom the service may write to. As built, that is the address of the page's door, where it is served over HTTPS, and on a tailnet that address holds your tailnet's name. It could be an address you set, such as an email, or nobody. Apple's documentation says its service turns away a contact that isn't a URL or a mailto address. Whether it takes a notification that names nobody is untried.
