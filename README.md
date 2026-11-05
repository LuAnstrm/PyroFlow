# PyroFlow Fireworks POS

Web-based POS with sales forecasting and inventory management.
React + Vite frontend, Node/Express API, MySQL database.

## Run it

1. Install and start a MySQL server. XAMPP works: open the XAMPP Control Panel and press **Start** next to MySQL.
2. In this folder, install the packages:

   ```bash
   npm install
   ```

3. Create the database, tables and demo data:

   ```bash
   npm run db:setup
   ```

4. Start the app, then open http://localhost:8443

   ```bash
   npm run dev
   ```

If your MySQL login isn't `root` with no password, copy `.env.example` to `.env` and edit it.
`npm run db:reset` deletes the database and creates it again from scratch.

## Demo accounts

| Role | Username | Password |
| --- | --- | --- |
| Administrator | `Admin123` | `Admin` |
| Owner | `Owner123` | `Owner` |
| Manager | `Manager123` | `Manager` |
| Staff (cashier) | `Staff` | `Staff` |

These are the default permissions. An administrator can change everything except the last two rows
under **Permissions & Security**. The server checks them on every request.

| | Admin | Owner | Manager | Staff |
| --- | --- | --- | --- | --- |
| Point of Sale and receipts | Yes | Yes | Yes | Yes |
| Dashboard | Everything | Sales and forecast | Today's sales | Own sales |
| Inventory | Full | View only | View and update stock | No |
| Add and update products | Yes | Yes | Yes, first price only | No |
| Change prices, see costs, remove products | Yes | Yes | No | No |
| Transactions | All, can refund | All | All, can refund | Own sales only |
| Forecast, reports, revenue and profit | Yes | Yes | No | No |
| Staff Operations (cashier activity, end a shift) | Yes | No | Yes | No |
| Accounts, login history, permissions, security | Yes | No | No | No |
| Business settings | Yes | No | No | No |

Everyone can edit their own name and password under Settings.

If you already have a database, the API upgrades it the first time it connects and keeps your data.
That upgrade never creates accounts. To add the demo Manager login to an older database, run
`npm run db:setup`.

## Before a demo

1. Start MySQL from the XAMPP Control Panel.
2. Run `npm run db:reset` the same day. The demo sales history ends on the day it was created, so
   an older database shows no sales today and a gap in the forecast. **This deletes everything in
   the database**, including any sales or accounts you added.
3. Run `npm run dev` and open http://localhost:8443

The app only accepts connections from this computer. To open it from another device on the same
network, start it with the `FIGMA_DEV_SERVER_HOST` environment variable set to `0.0.0.0`.

By default, five wrong passwords in a row locks that username for 2 minutes. An administrator can change
this under Permissions & Security. Restarting the API clears the lock.

To run the optimized build instead of the dev server: `npm run build`, then `npm start`, then open
http://localhost:4000

## Security

- Passwords are stored as bcrypt hashes. Session tokens are random, stored only as SHA-256 hashes,
  and kept in an HttpOnly cookie that page scripts can't read.
- Every permission is checked on the server, not just hidden in the UI. Cost prices never reach the browser of
  an account without the pricing permission, and Staff never receive shop-wide sales figures.
- Sale totals are calculated on the server from database prices. Prices sent by the browser are ignored.
- All SQL values are passed as parameters, and input is limited to what each column can hold.

This is a prototype. Before real use it would also need HTTPS, a MySQL password, and the demo
accounts and the login page's demo buttons removed.

## Restore the saved database

`database/pyroflow_pos.sql` is a snapshot of the demo database, without any login sessions. To use it
instead of `npm run db:setup`, run these from the project folder with MySQL running:

```bash
mysql -u root -e "CREATE DATABASE pyroflow_pos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
```

```bash
cmd /c "mysql -u root pyroflow_pos < database\pyroflow_pos.sql"
```

With XAMPP, `mysql` is at `C:\xampp\mysql\bin\mysql.exe` if the command isn't found. The first command
fails if `pyroflow_pos` already exists. The sales in the snapshot end on the day it was made, and
`npm run db:reset` replaces them with freshly generated demo data.

This file holds account password hashes and login history, including IP addresses and devices. It's
demo data only, so never put real customer or staff records in it while this repository is public.

## View the database in VS Code

Install a MySQL extension (for example "MySQL" by Weijan Chen), add a connection to
`127.0.0.1:3306` with your MySQL login, and open the `pyroflow_pos` database.
The table definitions are in `server/schema.sql`.

## How the forecast works

Everything is calculated from the `sales` table in `server/forecast.js`:

    predicted day = last 28 days' average x weekday pattern x seasonal change from last year

Accuracy comes from re-forecasting the last 4 weeks and comparing with what was really sold.
The sales history created by `db:setup` is generated demo data; replace it with real records
before relying on the numbers.
