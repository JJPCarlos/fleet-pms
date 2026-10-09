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
- Docker Engine with the Compose plugin (Linux), or Docker Desktop (Windows and macOS).
- A few GB of free disk space and an internet connection for the first build.

## Installation

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

**Windows and macOS:** install Docker Desktop from https://www.docker.com/products/docker-desktop/ and start it.
Run the commands below in PowerShell or Terminal.

### 2. Let your user run Docker without sudo (Linux only)

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

Open **http://localhost:8080** and sign in with:

- Username: `admin`
- Password: `admin123`

Change this password before real use (see "Change the admin password and secret" below).

### 6. Open it from a phone or another PC

Connect the other device to the same Wi-Fi, then open `http://<your PC's IP address>:8080`. Find the IP with
`ip a` (Linux), `ipconfig` (Windows), or `ifconfig` (macOS). If it doesn't load, your firewall is probably
blocking port 8080. On Fedora-based systems:

    sudo firewall-cmd --add-port=8080/tcp --permanent
    sudo firewall-cmd --reload

## Everyday use

    docker compose up -d           # start in the background
    docker compose logs -f         # watch the logs (Ctrl+C stops watching, not the app)
    docker compose down            # stop, keep all data
    docker compose down -v         # stop and wipe the database (deletes all data)

Your data lives in a Docker volume called `pgdata`, so it survives restarts and updates.

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

The app has no screen for creating users yet. With the app running, run these two commands in a terminal
(they need Python 3, which most Linux and macOS systems have):

    TOKEN=$(curl -s -X POST http://localhost:8080/api/login -H "Content-Type: application/json" \
      -d '{"username":"admin","password":"admin123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

    curl -X POST http://localhost:8080/api/users -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      -d '{"username":"mechanic1","password":"choose-a-password","role":"mechanic"}'

Use your real admin password in the first command. Use `"role":"admin"` for another admin.

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

    docker compose exec -T db pg_dump -U pms pms > backup.sql

## Troubleshooting

| Message or problem | What to do |
|---|---|
| `docker: command not found` | Docker isn't installed. Do step 1. |
| `failed to connect to the docker API ... no such file or directory` | The Docker service isn't running. Run `sudo systemctl enable --now docker`, then check with `systemctl status docker`. |
| `permission denied ... /var/run/docker.sock` | Your user isn't in the `docker` group in this session. Do step 2, then log out and back in, or use `newgrp docker` or `sudo`. |
| Port 8080 is already in use | In `docker-compose.yml`, change `"8080:80"` to `"8081:80"`, then open `http://localhost:8081`. |
| The page doesn't change after an update | Run `docker compose up --build`, then hard-refresh with Ctrl+Shift+R. |
| Login fails with the new password | See "Change the admin password and secret". |
| Phone can't reach the app | Same Wi-Fi? Correct PC IP? Allow port 8080 in the firewall (step 6). |
| A build step fails | Run `docker compose up --build` again and read the last 20 lines of the output. |

## Project layout

    docker-compose.yml      the three services: db (PostgreSQL), backend (FastAPI), frontend (nginx + React)
    backend/main.py         API, database models, login, and role checks
    backend/Dockerfile      builds the Python backend
    frontend/src/App.jsx    the whole user interface
    frontend/src/styles.css styles
    frontend/nginx.conf     serves the app and forwards /api requests to the backend
    frontend/Dockerfile     builds the React app, then serves it with nginx