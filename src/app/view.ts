/** What a screen has to provide to be shown by the app shell. */
export interface View {
  /** Root element of the screen. */
  el: HTMLElement;
  /** Text for the browser tab, without the app name. Read again after a language change. */
  title: () => string;
  /** Full-screen views (the 3D scene) hide the shell's header and footer. */
  immersive?: boolean;
  /** Release listeners, timers and GPU resources. */
  destroy?: () => void;
  /**
   * Called when the language changes. Views without it are simply rebuilt, which is fine for
   * screens that keep their state in the URL.
   */
  onLocaleChange?: () => void;
}
