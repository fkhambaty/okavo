/** Pins the page without turning body into a scrollport that clips fixed UI. */
export function lockPageScroll(): () => void {
  const y = window.scrollY;
  const { style } = document.body;
  const previousTop = style.top;
  document.body.classList.add("scroll-lock");
  style.top = `-${y}px`;
  return () => {
    document.body.classList.remove("scroll-lock");
    style.top = previousTop;
    window.scrollTo(0, y);
  };
}
