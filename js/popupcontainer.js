const { computePosition, shift, flip } = window.FloatingUIDOM;


export function setupPopup(buttonID, containerID) {
    const button = document.querySelector(buttonID);
    const tooltip = document.querySelector(containerID);


    // adding style css for tooltip via injecting style tag
    const style = document.createElement('style');
    style.innerHTML = `
${containerID} {
  width: 20rem;
  position: absolute;
  top: 0;
  left: 0;
  background: rgba(10, 6, 78, 0.582);
  color: white;
  font-weight: bold;
  padding: 5px;
  border-radius: 4px;
  font-size: 90%;
  display: none;
  flex-direction: column;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  z-index: 256;
}
@media screen and (max-width: 600px) {
${containerID} {
  width: 12rem;
}
}`;
    document.head.appendChild(style);

    function update() {
        computePosition(button, tooltip, {
            placement: 'bottom',
            middleware: [
                flip(), shift({ padding: 5 })
            ],
        }).then(({ x, y }) => {
            Object.assign(tooltip.style, {
                left: `${x}px`,
                top: `${y}px`,
            });
        });
    }
    function showTooltip() {
        tooltip.style.display = 'flex';
        update();
    }
    function hideTooltip() {
        tooltip.style.display = '';
    }
    function toogleTooltip() {
        if (tooltip.style.display === 'flex') {
            hideTooltip();
        } else {
            showTooltip();
        }
    }
    [
        ['click', toogleTooltip],
    ].forEach(([event, listener]) => {
        button.addEventListener(event, listener);
    });
    // if not clicking on tooltip, hide it
    document.body.addEventListener('click', (e) => {
        if (!tooltip.contains(e.target) && !button.contains(e.target)) {
            hideTooltip();
        }
    });
}