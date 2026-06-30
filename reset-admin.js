import sqlite3 from 'sqlite3';
import bcrypt from 'bcrypt';

// Allow passing a custom password via command line (e.g., node reset-admin.js newpass), defaults to 'admin123'
const newPassword = process.argv[2] || 'admin123'; 
const db = new sqlite3.Database('./database.sqlite');

const resetAdminPassword = async () => {
    console.log('[System] Initializing admin credential reset protocol...');
    console.log(`[System] Target password: ${newPassword}`);
    console.log('[System] Generating cryptographic hash...');

    try {
        const hash = await bcrypt.hash(newPassword, 10);

        db.run(`UPDATE users SET password = ? WHERE role = 'admin'`, [hash], function(err) {
            if (err) {
                console.error("[Database Error] Execution failed:", err.message);
            } else if (this.changes === 0) {
                console.error("[Error] Could not locate an administrative account in the system matrix.");
            } else {
                console.log(`[SUCCESS] Master administrator token has been forcibly overwritten to: ${newPassword}`);
            }
            
            // Close the database connection gracefully to prevent terminal hanging
            db.close((closeErr) => {
                if (closeErr) {
                    console.error("[Database Error] Failed to close connection:", closeErr.message);
                } else {
                    console.log("[System] Database connection terminated. Exiting.");
                }
                process.exit(err || this.changes === 0 ? 1 : 0);
            });
        });
    } catch (error) {
        console.error("[System Error] Cryptographic hashing failed:", error);
        db.close();
        process.exit(1);
    }
};

resetAdminPassword();