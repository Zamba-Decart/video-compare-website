// options.js — persist the Comparator destination URL to chrome.storage.sync.

const LIVE = 'https://zamba-decart.github.io/video-compare-website/src/index.html';
const LOCAL = 'http://localhost:8765/src/index.html';

const customInput = document.getElementById('custom-url');
const saveBtn = document.getElementById('save');
const savedFlag = document.getElementById('saved');

function selectedDest() {
  return document.querySelector('input[name="dest"]:checked')?.value || 'live';
}

function setDest(value) {
  const dest = value === 'custom' ? 'custom' : value;
  const radio = document.querySelector(`input[name="dest"][value="${dest}"]`);
  if (radio) radio.checked = true;
  customInput.disabled = selectedDest() !== 'custom';
}

function urlForDest() {
  switch (selectedDest()) {
    case 'local': return LOCAL;
    case 'custom': return customInput.value.trim();
    default: return LIVE;
  }
}

document.querySelectorAll('input[name="dest"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    customInput.disabled = selectedDest() !== 'custom';
    if (!customInput.disabled) customInput.focus();
  });
});

saveBtn.addEventListener('click', async () => {
  const comparatorUrl = urlForDest();
  if (!/^https?:\/\/.+/i.test(comparatorUrl)) {
    customInput.focus();
    customInput.setCustomValidity?.('Enter a full http(s) URL.');
    customInput.reportValidity?.();
    return;
  }
  await chrome.storage.sync.set({ comparatorUrl });
  savedFlag.classList.add('show');
  setTimeout(() => savedFlag.classList.remove('show'), 1400);
});

(async function init() {
  const { comparatorUrl } = await chrome.storage.sync.get('comparatorUrl');
  if (!comparatorUrl || comparatorUrl === LIVE) {
    setDest('live');
  } else if (comparatorUrl === LOCAL) {
    setDest('local');
  } else {
    setDest('custom');
    customInput.value = comparatorUrl;
    customInput.disabled = false;
  }
})();
