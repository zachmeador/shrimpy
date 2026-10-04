/** What a press of Ctrl+C did. */
export type Pressed = "cleared" | "armed" | "quit";

export interface InterruptOptions {
  /** How long after a press another one still counts as the second. */
  windowMs: number;
  /** Told when the console starts or stops waiting for the second press. */
  waiting(armed: boolean): void;
}

/**
 * Ctrl+C never quits at once. The first press clears what is typed, or if there
 * is nothing, just waits; a second press soon after, with nothing typed in
 * between, quits. Any other key, or enough time, makes the next press a first.
 */
export interface Interrupt {
  /** Ctrl+C, with whether something is typed. The person's text is theirs to clear when this says "cleared". */
  press(typed: boolean): Pressed;
  /** Any other key. */
  other(): void;
  close(): void;
}

export function interrupt(options: InterruptOptions): Interrupt {
  let armed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const disarm = (): void => {
    clearTimeout(timer);
    if (!armed) return;
    armed = false;
    options.waiting(false);
  };
  const arm = (): void => {
    clearTimeout(timer);
    timer = setTimeout(disarm, options.windowMs);
    if (armed) return;
    armed = true;
    options.waiting(true);
  };

  return {
    press(typed) {
      if (armed && !typed) {
        disarm();
        return "quit";
      }
      arm();
      return typed ? "cleared" : "armed";
    },
    other: disarm,
    close() {
      clearTimeout(timer);
      armed = false;
    },
  };
}
