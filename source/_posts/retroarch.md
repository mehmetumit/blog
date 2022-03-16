---
title: Best way to install Retroarch on arch linux
date: 2022-03-16 22:46:30
tags: Linux
---

* First install packages

```
sudo pacman -S retroarch retroarch-assets-glui retroarch-assets-ozone retroarch-assets-xmb libretro-core-info
```

* Change visibility of core updater to download cores from retroarch directly
**~/.config/retroarch/retroarch.cfg**
```
menu_show_core_updater = "true"
```
* Open retroarch than go to settings->directory change cores directory to **~/.config/retroarch/cores**
* After that, update databases from online updater. Now you can easily install cores from core downloader 🎮🎮🎮
