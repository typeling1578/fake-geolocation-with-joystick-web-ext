# Fake geolocation with joystick (web extension)

***Add-on for faking geolocation with joystick***

| <img align="center" src="https://github.com/user-attachments/assets/54e45474-5b27-4fe6-adb0-b76baceba624" alt="addon popup page" /> | <img align="center" src="https://github.com/user-attachments/assets/75b32cf7-9677-4b1d-8793-c2e03a198cd7" alt="faking geolocation" /> |
| ------------- | ------------- |

[![Get the add-on from addons.mozilla.org](https://github.com/user-attachments/assets/85b8556a-8578-4a87-a5ec-673690b79f9c)](https://addons.mozilla.org/addon/fake-geolocation-with-joystick/)

## How to use

### 1. First, pick a fake location.

Open the pop-up and click on the desired location on the map.

<img width="1303" height="994" alt="screenshot0" src="https://github.com/user-attachments/assets/9e7bfc01-dab5-43e7-bf56-c7b99cd7f23c" />

### 2. Enable the extension.

Click the power icon button and enable the extension.

<img width="1303" height="994" alt="screenshot1" src="https://github.com/user-attachments/assets/6fe6e21d-abd0-4659-a3a5-48d74edc33d9" />

### 3. Open the page to fake location.

> [!WARNING]
> **If the page is already open, you need to reload it.**

> [!NOTE]
> Movement via joystick is available on pages that continuously track location.

<img width="1302" height="990" alt="screenshot2" src="https://github.com/user-attachments/assets/5e00f848-a54f-4b72-be02-866652c70b5d" />

## How to build

### 1. Install packages

```bash
pnpm install --frozen-lockfile
```

### 2. Build

#### Chrome

```bash
pnpm run zip
```

Output path: `./.output/fake-geolocation-with-joystick-*.*.*-chrome.zip`

#### Firefox

```bash
pnpm run zip:firefox
```

Output path: `./.output/fake-geolocation-with-joystick-*.*.*-firefox.zip`

## Donate

<a href="https://patreon.com/typeling1578"><img width="125" src="https://c5.patreon.com/external/logo/become_a_patron_button.png" alt="Patreon" /></a>
