import sqlite3 from 'sqlite3';
import bcrypt from 'bcrypt';

const db = new sqlite3.Database('./database.sqlite');
const newPassword = 'admin123'; 

console.log('Encrypting new password...');

const hash = await bcrypt.hash(newPassword, 10);

db.run(`UPDATE users SET password = ? WHERE role = 'admin'`, [hash], function(err) {
    if (err) {
        console.error("Database error:", err.message);
    } else if (this.changes === 0) {
        console.log("Error: Could not find an admin account in the database.");
    } else {
        console.log("SUCCESS! The admin password is now forcibly set to: " + newPassword);
    }
});
