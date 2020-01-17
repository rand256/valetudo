<div align="center">
    <img src="https://github.com/rand256/valetudo/blob/testing/assets/logo/valetudo_logo_with_name.svg" width="800" alt="valetudo">
    <p align="center"><h2>Free your vacuum from the cloud</h2></p>
</div>

----

### Preamble:

This is a modified version of [Valetudo by Hypfer](https://github.com/Hypfer/Valetudo), _enhanced_ by me since I found too many features missing in the original package when I've tried to use it for the first time. Next is a quick list of changes first appeared here:

* Ability to select multiple saved zones at once;
* Selected zones optionally shown at the map tab to see and edit what's actually going to be cleaned;
* Configurable virtual walls and forbidden zones, finally!
* Scheduled zoned cleaning - when you do not need to clean the whole house;
* Ability to specify the number of iterations to clean the same zone multiple times;
* Showing status of the device on the map; 
* Set of dynamically appearing buttons on the map to better control device from there;
* Experimental ability to save/restore maps;
* A telegram bot software for remote control from the outside world;
* A number of visual changes and under-the-hood optimizations.

**Also localization is supported since 0.4.0-RE7!**
Currently available for en/de/ru/bg. Add your own native language support by editing ./client/locales/en.json template and sending a PR.

----

### Installing

Check [deployment section](/deployment) or [this wiki page](https://github.com/rand256/valetudo/wiki/Installation-process) on how to install Valetudo onto your device.

### Screenshots of this mod:

<details>
  <summary>View screenshots</summary>
  
![qscr1](https://user-images.githubusercontent.com/30267719/67139290-3bbf9a80-f257-11e9-85f1-698617d44a06.png)
![qscr2](https://user-images.githubusercontent.com/30267719/67139299-585bd280-f257-11e9-8688-7d684d90a3d5.png)
----
![qscr3](https://user-images.githubusercontent.com/30267719/67139303-67428500-f257-11e9-881e-72d71c077886.png)
![qscr4](https://user-images.githubusercontent.com/30267719/67139307-732e4700-f257-11e9-9f5a-5ba95288d82e.png)
----
![qscr5](https://user-images.githubusercontent.com/30267719/67139309-7cb7af00-f257-11e9-97e0-0d55f402022d.png)
![qscr6](https://user-images.githubusercontent.com/30267719/67139314-85a88080-f257-11e9-88cd-8d191c2193e0.png)
----
![qscr7](https://user-images.githubusercontent.com/30267719/67139321-98bb5080-f257-11e9-9060-a540ec89efa0.png)
![qscr8](https://user-images.githubusercontent.com/30267719/67139318-8f31e880-f257-11e9-9464-1c39682d6020.png)
  
</details>

### Join the Discussion
* [Valetudo Telegram group](https://t.me/joinchat/AR1z8xOGJQwkApTulyBx1w)

### Getting map picture for integrations
* [valetudo-mapper](https://github.com/rand256/valetudo-mapper) - a companion service for generating PNG Maps
* You can also try to request a simple map from Valetudo RE itself via http at `/api/simple_map`, but it shouldn't be called too often since resources of the vacuum are limited.
