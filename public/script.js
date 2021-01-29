document.addEventListener('DOMContentLoaded', (event) => {
  const gerber = document.querySelector('gerber');
  const info = document.querySelector('info');
})
function fileLabel() {
  info.innerHTML = gerber.files[0].name;
}