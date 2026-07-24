import { CustomMessageComponent } from "@earendil-works/pi-coding-agent";
import { TURN_CONTEXT_CUSTOM_TYPE } from "../sessions/turn-context.js";

const PATCH_MARKER = Symbol.for("shrimpy.turn-context-rendering");

interface TurnContextCustomMessageComponent {
  message?: { customType?: string };
  _expanded?: boolean;
  render(width: number): string[];
}

interface PatchablePrototype {
  [PATCH_MARKER]?: boolean;
  render(width: number): string[];
}

/**
 * Pi always reserves a leading spacer for custom messages, even when a custom
 * renderer has no collapsed content. Suppress the entire turn-context component
 * until Ctrl+O expands it so hidden model context does not create blank rows.
 */
export function installShrimpyTurnContextRendering(): void {
  const prototype = CustomMessageComponent.prototype as unknown as PatchablePrototype;
  if (prototype[PATCH_MARKER]) return;

  const originalRender = Reflect.get(
    prototype,
    "render",
  ) as PatchablePrototype["render"];
  prototype.render = function renderShrimpyTurnContext(
    this: TurnContextCustomMessageComponent,
    width: number,
  ): string[] {
    if (
      this.message?.customType === TURN_CONTEXT_CUSTOM_TYPE
      && this._expanded === false
    ) {
      return [];
    }
    return Reflect.apply(originalRender, this, [width]) as string[];
  };
  prototype[PATCH_MARKER] = true;
}
