### Downloading pre-built Valetudo

You can simply download pre-built binaries of Valetudo from the
[releases](https://github.com/rand256/valetudo/releases) section of the repo.
It is currently distrubuted in three different ways:

* **valetudo.tar.gz**

   This is a single binary file packed with tar+gzip compression. To use it,
   start with unpacking it typing `tar zxf valetudo.tar.gz` or via your favourite
   GUI (de)compressing tool. Continue reading from *Installing and configuring*
   section on what to do next.

* **valetudo_**_**version**_**_armhf.deb**

   This is a package containing both valetudo binary and its configuration files. 
   You need to put it on the device to i.e. /mnt/data directory and then it can be
   installed by issuing `dpkg -i filename.deb` on the console. 
   It will unpack itself and put all the files to the required places, so you won't
   need to create them yourself. After installation you will only have to restart
   the device using `reboot` command.

* **v11_**_**version**_**.pkg**

   The last way to get prebuilt valetudo onto your device is to flash one of these firmware
   images with valetudo preinstalled inside. It can be easily done using
   [XVacuum](https://forum.xda-developers.com/android/apps-games/app-xvacuum-firmware-xiaomi-vacuum-t3896526)
   app for your smartphone. Vacuum Gen.1 has firmware version numbers like **003xxx** and vacuum Gen.2
   (roborock S5) has firmware version numbers like **001xxx**. After flashing the firmware you will
   immediately have working device with valetudo preinstalled. Next you should connect
   to its access point and visit http://192.168.8.1 site to setup Wi-Fi settings.

You can use any of these also for upgrading an older valetudo version to current one.

### Acquiring sources and building Valetudo

If you wish to build Valetudo yourself, you will need a reasonably new NodeJS.
You can install this from your distro (preferred), or using one of the official
pre-compiled binaries on the node website. `pkg` is able to create armv7-binaries
on x86 (and other platforms) just fine — as long as it does not need to pre-compile
its JS bytecode. This is why we specify `--no-bytecode`.
```
git clone http://github.com/rand256/valetudo
cd valetudo
npm install
npm run build
```

Next things get a bit more complicated.

Current `pkg` version (4.4.0 and above) that we use to pack Valetudo into a single
binary file has libstdc++ library incompatible with that available in stock vacuum's
firmware. Unfortunately the last `pkg` which was compatible used node-10.4.1 binaries
that are quiet outdated and also known for issues with timers in the long run.

Thus Valetudo RE based on newer `pkg` requires to install a bit updated libstdc++ package
into the vacuum. The *.deb files needed could be found on launchpad.net
but since Ubuntu 14.04 is EOL they are slowly getting deleted from there.
The copy of suitable library (from gcc-6.2.0) is available in `deps` directory.
To install scp `*.deb`s to the vacuum and run `dpkg -i file.deb`.

Another way to deal with this issue is to manually rebuild `pkg` binaries to link
libstd++ statically. This is the way how prebuilt Valetudo binary was created here.

### Installing and configuring

When you'll get a binary named `valetudo`, you should scp it to `/usr/local/bin/` directory.

Then create `/etc/init/valetudo.conf` using the file located in `etc` directory to auto-start Valetudo.

To see maps in Valetudo you will need to prevent the robot from communicating with
Xiaomi cloud by setting up iptables and configuring the `/etc/hosts`, so that
Xiaomi hostnames were redirected locally back to Valetudo.

First add the content of `deployment/etc/hosts` to your `/etc/hosts`
file on the robot.

Second edit the `/etc/rc.local` file and add the content of
`deployment/etc/rc.local` before the `exit 0` line.

### Reboot

You can now reboot the robot.
