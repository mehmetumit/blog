---
title: Control Your Laptop Fans on Linux with nbfc-linux
date: 2022-06-21 23:35:36
tags: 
- Linux
- Tools
---
> nbfc-linux is c port of nbfc which has same functionality. Memory consumption is much higher in traditional one ***(~50MB vs ~350KB)*** because of Mono framework. I recommend to use nbfc-linux but you can use bloated one too.
**Warning: Configuring or completely stopping fans on high system load might result in permanently damaged hardware.**
* First install [nbfc-linux](https://github.com/nbfc-linux/nbfc-linux)
> If you use AUR and yay you can install with 
>```
yay -S nbfc-linux
>```
* Set nbfc config if your laptop's model exists in configs
```
sudo nbfc config -s auto
```
> If your laptop model did not match you can set config from recomended ones or try another model which same brand as your laptop.
* Get list of recomended ones
```
sudo nbfc config -r
```
* Get same brand
```
sudo nbfc config -l | grep <YOUR_LAPTOP_BRAND_OR_SERIES>
```
* Set with model name
```
sudo nbfc config -s <MODEL>
```
* Start nbfc service
```
sudo nbfc start
```
> If you wish nbfc_service to get started on boot
>```
sudo systemctl enable nbfc_service --now
>```
* Now you can set your fan speed with fan index
	* Adjust the fan speed automatically
```
sudo nbfc set -f <FAN_INDEX(0-x)> -a
```
	* Set the fan speed to given value
```
sudo nbfc set -f <FAN_INDEX> -s <FAN_SPEED(0-100)>
```
