<div align="center">
    <img src="https://github.com/rand256/valetudo/blob/testing/assets/logo/valetudo_logo_with_name.svg" width="800" alt="valetudo">
    <p>&nbsp;</p>
    <h2>Free your vacuum from the cloud</h2>
</div><div>
    <h5>
        Fully supported devices: Roborock S5 and Xiaomi Mi Robot Vacuum Cleaner (v1)<br>
        Preliminary supported devices: Roborock S6 and other III-generation Roborock vacuums
    </h5>
</div>

----

### Preamble:

This is a fork of [Valetudo by Hypfer](https://github.com/Hypfer/Valetudo), created by me since I found too many features missing in the original package when I've tried to use it for the first time. 

Features added lately:
* Preliminary support for Roborock gen3 devices;
* MQTT: Tracking the time when the dustbin was last emptied or for how long it was in use;
* MQTT: Possibility of playing sound files on the device by issuing a mqtt command;
* Optional ability to see a live map on the Remote Control tab;


And this is a quick list of features first appeared here:

* Ability to select multiple saved zones at once;
* Selected zones optionally shown at the map tab to see and edit what's actually going to be cleaned;
* Configurable virtual walls and forbidden zones (requires Gen2);
* Ability to see the actual map of cleanings that were finished recently;
* Scheduled zoned cleaning - when you do not need to clean the whole house;
* Scheduled rooms cleaning - the same thing for newer firmware of Gen2;
* Ability to specify the number of iterations to clean the same zone multiple times;
* Display device's status on the map, as well as a set of quick action buttons that are dynamically switching at state changes;
* Multilanguage support, currently available in bg/ca/cz/de/en/es/fi/fr/hu/it/lv/nl/ru/sv/pl;
* A telegram bot software for controlling the vacuum from the outside world;
* Experimental ability to SAVE and RESTORE the main map (with per-map list of saved zones and spots);
* Full support of room cleaning (requires Gen2 with firmware 2008+);
* Cleaning queue, allowing the use of zoned cleaning with more than 5 zones via enqueuing any number of additional cleanups at once;
* Possibility to enqueue additional zones and segments during cleaning or additional goto spots during the movement;
* Ability to run Goto + Spot cleaning (by long pressing "Goto" button on the map tab);
* Selecting the destination for the device to go when the cleaning is finished (configured globally in settings or per-cleaning by long pressing "Start" button on the map tab);
* Visual preview and edit of zones and rooms for corresponding scheduled cleaning.


You can add or improve your own native language support by using ./client/locales/en.json template as an example and sending a PR.

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

### Getting map picture for integrations
* [valetudo-mapper](https://github.com/rand256/valetudo-mapper) - a companion service for generating PNG maps;
* You can also try to request a simple map from Valetudo RE itself via http at `/api/simple_map`, but it shouldn't be called too often since resources of the vacuum are limited.
