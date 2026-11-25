// Where a browser keeps the page its full height under the keyboard (iOS Safari), the visual
// viewport says how much of it the keyboard covers. Floating bars sit on top of `--keyboard`.

if (window.visualViewport) {
  const fit = () => {
    const covered = innerHeight - visualViewport.height - visualViewport.offsetTop;
    if (covered > 1) document.documentElement.style.setProperty("--keyboard", `${covered}px`);
    else document.documentElement.style.removeProperty("--keyboard");
  };
  visualViewport.addEventListener("resize", fit);
  visualViewport.addEventListener("scroll", fit);
  fit();
}
