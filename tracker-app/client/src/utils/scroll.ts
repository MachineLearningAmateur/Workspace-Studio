export function preserveWindowScroll(update: () => void) {
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  update();

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      window.scrollTo(scrollX, scrollY);
    });
  });
}
