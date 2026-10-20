const navigation = document.querySelector(".screens-nav");
const buttons = Array.from(document.querySelectorAll("[data-screen]"));
const panels = Array.from(document.querySelectorAll("#screens figure"));

function showScreen(button) {
  const target = panels.find((panel) => panel.id === button.dataset.screen);
  if (!target) return;

  for (const item of buttons) {
    item.setAttribute("aria-pressed", String(item === button));
  }
  for (const panel of panels) {
    panel.hidden = panel !== target;
  }
}

if (navigation && buttons.length > 0 && panels.length > 0) {
  for (const button of buttons) {
    button.addEventListener("click", () => showScreen(button));
  }
  showScreen(buttons[0]);
  navigation.hidden = false;
}
