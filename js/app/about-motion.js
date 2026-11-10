/* Motion of the "About our team" illustration: the introduction (an expense is added) plays once for
   a visit to the page; later redraws of the page show the finished picture and only the small
   ambient drift goes on. The drift stops while the picture is off the screen or the app is hidden,
   so it costs nothing then. */
const INTRO_MS = 5200;
let played = false;
let watching = null;

export function initAboutMotion() {
  const art = document.querySelector(".about-art");
  if (!art) {
    played = false; // the page was left: the next visit plays the introduction again
    watching?.disconnect();
    watching = null;
    return;
  }
  if (played) art.classList.add("settled");
  else setTimeout(() => (played = true), INTRO_MS);
  const pause = (paused) => art.setAttribute("data-paused", String(paused));
  watching?.disconnect();
  if ("IntersectionObserver" in window) {
    watching = new IntersectionObserver(([entry]) =>
      pause(!entry.isIntersecting || document.hidden),
    );
    watching.observe(art);
  }
  pause(document.hidden);
}

document.addEventListener("visibilitychange", () => {
  const art = document.querySelector(".about-art");
  if (art) art.setAttribute("data-paused", String(document.hidden));
});
