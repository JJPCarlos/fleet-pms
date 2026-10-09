# Fleet PMS Manager

A web app for scheduling vehicle preventive maintenance (PMS), logging repairs, and tracking supplies.
It works in any browser on a PC or a phone. Built with FastAPI (Python), React, and PostgreSQL, and
run with Docker Compose.

## What it does

- **Home:** quick actions (Schedule PMS, Record repair, Add vehicle, Add inventory item) and a "Needs attention" list.
- **Calendar:** a month view with the selected day's details beside it. Schedule PMS or repair jobs, mark them
  complete, or press **Start maintenance**. A service not finished by 5:00 PM on its day is flagged
  **Under maintenance** automatically, with the date it started.
- **Vehicles:** odometer, last PMS, next due date, km left, and a status of OK, Due soon, or Overdue.
  Due is whichever comes first, the month interval or the km interval.
- **Inventory:** supplies, consumables, and property and equipment, with search, a category filter, a typed
  +/- stock adjustment, and low-stock alerts.
- **Supply log and Service log:** a searchable history of every stock change and every PMS or repair job.
- **Roles:** `admin` and `mechanic`.

## Requirements

- A computer that stays on while others use the app (your PC, a laptop, or a server).
- Docker: Docker Engine on Linux, or Docker Desktop on Windows and macOS.
- A few GB of free disk space and an internet connection for the first build.

Pick your system:

- [Installation on Linux](#installation-on-linux)
- [Installation on Windows](#installation-on-windows)
- macOS: install Docker Desktop from https://www.docker.com/products/docker-desktop/ and start it, then follow the
  Linux steps 3 to 6 (skip the `docker` group step).

After installing, [Everyday use](#everyday-use) and everything below it apply to every system. Commands that
differ on Windows are shown for both.

---

## Installation on Linux

### 1. Install Docker

**Fedora, Nobara, and other Fedora-based Linux** (Docker Engine, no Docker Desktop needed):

    sudo dnf -y install dnf-plugins-core
    sudo dnf config-manager addrepo --from-repofile=https://download.docker.com/linux/fedora/docker-ce.repo
    sudo dnf install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    sudo systemctl enable --now docker

- If `dnf config-manager addrepo` gives an error, your dnf is older. Use
  `sudo dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo` instead.
- If `docker` was suggested from the `docker-cli` or `podman-docker` package, remove them first, because they
  conflict with Docker Engine: `sudo dnf remove podman-docker docker-cli`.

**Ubuntu, Debian, and other Linux:** follow the official steps at https://docs.docker.com/engine/install/

### 2. Let your user run Docker without sudo

    sudo usermod -aG docker $USER

This command prints nothing when it works. Then log out and back in, or reboot, so the change applies.
To apply it to just the current terminal, run `newgrp docker`. Check it worked:

    docker --version
    docker compose version
    docker version          # should list both a Client and a Server section

If you skip this step, put `sudo` in front of every `docker` command.

### 3. Get the project

Unzip `fleet-pms-docker.zip`, then open a terminal in the `fleet-pms` folder, the one that contains
`docker-compose.yml`:

    cd fleet-pms

### 4. Start it

    docker compose up --build

The first build takes a few minutes because it downloads the Python, Node, and PostgreSQL images. When the
logs settle, the app is running. Leave the terminal open, or run `docker compose up --build -d` to start it in
the background.

A menu at the bottom of the logs (`w Enable Watch`, `d Detach`) is normal. Press `d` to move it to the
background. You can ignore `w`.

### 5. Sign in

Open **http://localhost:8080** and sign in with `admin` / `admin123`.
Change this password before real use (see "Change the admin password and secret" below).

### 6. Open it from a phone or another PC

Connect the other device to the same Wi-Fi, then open `http://<your PC's IP address>:8080`. Find the IP with
`ip a`. If it doesn't load, your firewall is probably blocking port 8080. On Fedora-based systems:

    sudo firewall-cmd --add-port=8080/tcp --permanent
    sudo firewall-cmd --reload

---

## Installation on Windows

Docker runs the app in Linux containers. On Windows, Docker Desktop does this using WSL 2 (Windows Subsystem
for Linux). The steps below use PowerShell.

### 1. Check your computer

- Windows 10 (64-bit, version 22H2) or Windows 11 (64-bit). Docker's documentation also notes that Windows
  Home can run Linux containers, which is all this project needs.
- 8 GB of RAM is Docker's stated requirement.
- Hardware virtualization turned on in the BIOS/UEFI. It is on by default on most newer PCs. To check, open
  Task Manager, then the Performance tab, then CPU, and look for "Virtualization: Enabled". If it says Disabled,
  turn on Intel VT-x or AMD SVM (sometimes called "SVM Mode") in the BIOS/UEFI settings.

### 2. Install WSL 2 (if you don't have it)

Open PowerShell as administrator (right-click Start, then "Terminal (Admin)" or "Windows PowerShell (Admin)"),
run this, then restart the computer:

    wsl --install

Docker Desktop may do this for you, so you can also skip this step and come back to it if Docker Desktop
says WSL is missing or out of date. If it says WSL is out of date, run `wsl --update` in PowerShell.

### 3. Install Docker Desktop

1. Download it from https://www.docker.com/products/docker-desktop/
2. Double-click `Docker Desktop Installer.exe`. If it asks which backend to use, keep the WSL 2 option selected.
   It also asks for an install mode: "all users" asks for administrator permission, and "per user" does not.
   Either works for this project.
3. When the installer finishes, restart the computer if it asks you to.
4. Start **Docker Desktop** from the Start menu. Accept the agreement if asked, and wait until Docker Desktop
   shows that the engine is running. Skipping the sign-in is fine.
5. Open a **new** PowerShell window and check:

        docker --version
        docker compose version

Docker Desktop must be running whenever you use the app. Docker's license terms require a paid subscription for
commercial use in larger companies (more than 250 employees or more than 10 million USD in annual revenue). It
is free for personal use, education, and small businesses. Check Docker's terms if you use it at a larger
organization.

If you are not a local administrator, an administrator must add your account to the `docker-users` group
(PowerShell as administrator), then you sign out and back in:

    net localgroup docker-users "YourWindowsUsername" /add

### 4. Get the project

Right-click `fleet-pms-docker.zip` and choose **Extract All**. Open the extracted `fleet-pms` folder, the one
that contains `docker-compose.yml`. Click the address bar at the top of the File Explorer window, type
`powershell`, and press Enter. This opens PowerShell in that folder.

### 5. Start it

    docker compose up --build

The first build takes a few minutes because it downloads the Python, Node, and PostgreSQL images. When the
logs settle, the app is running. Leave the window open, or run `docker compose up --build -d` to start it in
the background.

If Windows asks whether to allow Docker through the firewall, allow it on Private networks.

### 6. Sign in

Open **http://localhost:8080** in your browser and sign in with `admin` / `admin123`.
Change this password before real use (see "Change the admin password and secret" below).

### 7. Open it from a phone or another PC

Connect the other device to the same Wi-Fi. Find your PC's address by running `ipconfig` and reading the
"IPv4 Address" under your Wi-Fi or Ethernet adapter, then open `http://<that address>:8080` on the other device.

If it doesn't load, Windows Defender Firewall is probably blocking port 8080. In PowerShell as administrator:

    New-NetFirewallRule -DisplayName "Fleet PMS 8080" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow -Profile Private

This only allows connections on networks Windows marks as Private. If your home Wi-Fi is marked Public, change
it to Private in Settings, then Network & internet, then Wi-Fi, then your network's properties. To remove the
rule later: `Remove-NetFirewallRule -DisplayName "Fleet PMS 8080"`.

---

## Everyday use

    docker compose up -d           # start in the background
    docker compose logs -f         # watch the logs (Ctrl+C stops watching, not the app)
    docker compose down            # stop, keep all data
    docker compose down -v         # stop and wipe the database (deletes all data)

These are the same on every system. Your data lives in a Docker volume called `pgdata`, so it survives restarts
and updates.

After the computer restarts, the app does not start by itself. On Windows, start Docker Desktop first and wait
for the engine to be running. Then, in the `fleet-pms` folder, run `docker compose up -d`.

## Updating after a code change

When you replace files such as `frontend/src/App.jsx`, `frontend/src/styles.css`, or `backend/main.py`:

    docker compose down
    docker compose up --build

Then hard-refresh the page (Ctrl+Shift+R) so the browser doesn't show the old version. The database upgrades
itself on startup when a new column is needed, so you do not need `down -v` and your data stays.

## Change the admin password and secret

Edit `docker-compose.yml`, under `backend` then `environment`:

    SECRET: change-this-secret      # any long random text; it signs login sessions
    ADMIN_USER: admin
    ADMIN_PASS: admin123

The admin account is created only the first time the database starts. If you already ran the app, changing
`ADMIN_PASS` has no effect until you reset the database with `docker compose down -v` (this deletes all data).

## Add a mechanic account

The app has no screen for creating users yet. With the app running, run the commands for your system. Use your
real admin password, and use `"role":"admin"` for another admin.

**Linux and macOS** (needs Python 3):

    TOKEN=$(curl -s -X POST http://localhost:8080/api/login -H "Content-Type: application/json" \
      -d '{"username":"admin","password":"admin123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

    curl -X POST http://localhost:8080/api/users -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      -d '{"username":"mechanic1","password":"choose-a-password","role":"mechanic"}'

**Windows PowerShell** (the `curl` command in Windows PowerShell is something else, so use these instead):

    $login = Invoke-RestMethod -Method Post -Uri http://localhost:8080/api/login -ContentType "application/json" -Body '{"username":"admin","password":"admin123"}'

    Invoke-RestMethod -Method Post -Uri http://localhost:8080/api/users -ContentType "application/json" -Headers @{ Authorization = "Bearer $($login.token)" } -Body '{"username":"mechanic1","password":"choose-a-password","role":"mechanic"}'

## Roles

- **admin:** everything, including deleting vehicles and inventory items and creating users.
- **mechanic:** schedule, complete, and delete jobs; add vehicles and inventory items; update odometer and stock.
  Mechanics cannot delete vehicles or inventory items, or create users.

## Settings you can change

At the top of `frontend/src/App.jsx`:

    const AUTO_MARK = true;     // false = services become "Under maintenance" only when someone presses Start maintenance
    const CUTOFF_HOUR = 17;     // the hour (24-hour clock) after which an unfinished service is flagged

The cutoff uses the clock of the device showing the page. Rebuild after changing it (see "Updating").

## Back up the data

Linux and macOS:

    docker compose exec -T db pg_dump -U pms pms > backup.sql

Windows PowerShell (the plain `>` redirect saves the file in a format other tools can't read, so go through `cmd`):

    cmd /c "docker compose exec -T db pg_dump -U pms pms > backup.sql"

## Troubleshooting

| Message or problem | What to do |
|---|---|
| `docker: command not found` (Linux) | Docker isn't installed. Do Linux step 1. |
| `failed to connect to the docker API ... no such file or directory` (Linux) | The Docker service isn't running. Run `sudo systemctl enable --now docker`, then check with `systemctl status docker`. |
| `permission denied ... /var/run/docker.sock` (Linux) | Your user isn't in the `docker` group in this session. Do Linux step 2, then log out and back in, or use `newgrp docker` or `sudo`. |
| `docker` is not recognized (Windows) | Docker Desktop isn't installed, or this PowerShell window was opened before you installed it. Install it, then open a new PowerShell window. |
| `error during connect ... dockerDesktopLinuxEngine ... cannot find the file specified` (Windows) | Docker Desktop isn't running yet. Start it from the Start menu and wait until it shows the engine is running, then try again. |
| Docker Desktop says virtualization is disabled, or WSL is missing or outdated (Windows) | Turn on virtualization in the BIOS/UEFI (Windows step 1), run `wsl --install` or `wsl --update` as administrator (Windows step 2), then restart. |
| Port 8080 is already in use | In `docker-compose.yml`, change `"8080:80"` to `"8081:80"`, then open `http://localhost:8081`. |
| The page doesn't change after an update | Run `docker compose up --build`, then hard-refresh with Ctrl+Shift+R. |
| Login fails with the new password | See "Change the admin password and secret". |
| Phone can't reach the app | Same Wi-Fi? Correct PC IP? Allow port 8080 in the firewall (Linux step 6 or Windows step 7). |
| A build step fails | Run `docker compose up --build` again and read the last 20 lines of the output. |

## Project layout

    docker-compose.yml      the three services: db (PostgreSQL), backend (FastAPI), frontend (nginx + React)
    backend/main.py         API, database models, login, and role checks
    backend/Dockerfile      builds the Python backend
    frontend/src/App.jsx    the whole user interface
    frontend/src/styles.css styles
    frontend/nginx.conf     serves the app and forwards /api requests to the backend
    frontend/Dockerfile     builds the React app, then serves it with nginx