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

## Team, roles and invite codes

There's one **Owner** role with full access. Everyone else gets a role the owner makes, with only the
features that job needs. It works like a classroom code:

1. Each person makes their own login: **Create an account** on the sign-in page.
2. The owner opens **Team & Roles → Invite codes**, makes a code for a role (for example Cashier), and
   gives it to them. A code can expire after 1, 7 or 30 days and be limited to a number of people.
3. The person types the code, during sign-up or after signing in, and joins with that role.

The owner can make new roles, change what any role can do, move people between roles, and remove
someone from the shop. A removed person keeps their account and past sales and can rejoin with a new
code. In an empty database the first person to register becomes the Owner.

The shop starts with these roles. The owner can change any of them under **Team & Roles → Roles**.
The server checks every permission on every request.

| | Owner | Manager | Cashier | Inventory Clerk |
| --- | --- | --- | --- | --- |
| Point of Sale and receipts | Yes | Yes | Yes | No |
| Transactions | All, can refund | All, can refund | Own sales only | No |
| Dashboard | Everything | Shop sales | Own sales | Stock only |
| Inventory, stock in, damaged, counts | Yes | Yes | No | Yes |
| Add and update products | Yes | Yes, first price only | No | Yes, first price only |
| Change prices, see costs, remove products | Yes | No | No | No |
| Forecast, reports, revenue and profit | Yes | No | No | No |
| Staff Operations (cashier activity, end a shift) | Yes | Yes | No | No |
| Team & Roles, invite codes, security, business settings | Yes | No | No | No |

Everyone can edit their own name and password under Settings.

## Demo accounts

| Role | Username | Password |
| --- | --- | --- |
| Owner | `Owner123` | `Owner` |
| Manager | `Manager123` | `Manager` |
| Cashier | `Staff` | `Staff` |
| Inventory Clerk | `Inventory123` | `Inventory` |
| Registered, not in the shop yet | `paolo.garcia` | `Newhire1234` |

Demo invite codes: `CASHIER` (Cashier) and `STOCKRM` (Inventory Clerk). Codes you make yourself are random.

If you already have a database, the API upgrades it the first time it connects and keeps your data:
Administrator and Owner accounts become Owner, Staff become Cashier, and saved Manager and Staff
permissions carry over. That upgrade never creates accounts.

## Payments

Online payments record the exact provider (GCash, Maya, GoTyme, ShopeePay, GrabPay, QR Ph, or a bank
such as BDO or BPI, or any name typed under Other), the reference number, who paid, and a photo or
screenshot of the payment. Card payments record the card type (Visa, Mastercard, JCB, ...), the approval
code, the last 4 digits and an optional photo of the terminal slip. The photo is required for online
payments unless the owner turns that off under **Settings → Payments**.

Photos are shrunk in the browser and stored in the `payment_proofs` table. Open one from the sale in
**Transactions**. They're kept under 700 KB because XAMPP's MySQL only accepts 1 MB per statement.

## Before a demo

1. Start MySQL from the XAMPP Control Panel.
2. Run `npm run db:reset` the same day. The demo sales history ends on the day it was created, so
   an older database shows no sales today and a gap in the forecast. **This deletes everything in
   the database**, including any sales or accounts you added.
3. Run `npm run dev` and open http://localhost:8443

The app only accepts connections from this computer. To open it from another device on the same
network, start it with the `FIGMA_DEV_SERVER_HOST` environment variable set to `0.0.0.0`.

By default, five wrong passwords in a row locks that username for 2 minutes. The owner can change
this under Security. Restarting the API clears the lock.

To run the optimized build instead of the dev server: `npm run build`, then `npm start`, then open
http://localhost:4000

## Security

- Passwords are stored as bcrypt hashes. Session tokens are random, stored only as SHA-256 hashes,
  and kept in an HttpOnly cookie that page scripts can't read.
- Every permission is checked on the server, not just hidden in the UI. Cost prices never reach the browser of
  an account without the pricing permission, and roles without "Monitor daily sales" never receive shop-wide sales figures.
- Sale totals are calculated on the server from database prices. Prices sent by the browser are ignored.
- All SQL values are passed as parameters, and input is limited to what each column can hold.

This is a prototype. Before real use it would also need HTTPS, a MySQL password, and the demo
accounts and demo invite codes removed. Invite codes also count toward the sign-in lock, so they can't be guessed by trying many.

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
