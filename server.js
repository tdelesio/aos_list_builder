const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;

// Setup PostgreSQL pool with connection pooling and high resilience
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@db:5432/warhammer_list_builder';
const pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

// Configure standard middlewares
app.use(cors());
// Set payload limits to 50mb to defensively allow uploading huge rule database files
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static assets from our workspace root directory
app.use(express.static(__dirname));

// Express route mapping for index page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', database: 'connected' });
    } catch (err) {
        res.status(500).json({ status: 'error', database: err.message });
    }
});

// GET database endpoint: dynamically constructs the nested JSON rules representation from relational table
app.get('/api/database', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM battle_profiles ORDER BY name ASC');
        const database = {
            factions: {},
            regiments_of_renown: [],
            manifestations: [],
            legends: {}
        };
        
        for (const row of result.rows) {
            const item = {
                name: row.name,
                unit_size: row.unit_size,
                points: row.points,
                points_raw: row.points_raw,
                base_size: row.base_size,
                options_or_keywords: row.options_or_keywords,
                notes: row.notes,
                raw_lines: row.raw_lines || []
            };
            
            const category = row.category;
            const faction = row.faction;
            
            if (category === 'regiments_of_renown') {
                database.regiments_of_renown.push(item);
            } else if (category === 'manifestations') {
                database.manifestations.push(item);
            } else if (category === 'legends_heroes' || category === 'legends_units') {
                if (!database.legends[faction]) {
                    database.legends[faction] = { heroes: [], units: [] };
                }
                if (category === 'legends_heroes') {
                    database.legends[faction].heroes.push(item);
                } else {
                    database.legends[faction].units.push(item);
                }
            } else { // 'heroes', 'units', 'auxiliary'
                if (!database.factions[faction]) {
                    database.factions[faction] = { heroes: [], units: [], auxiliary: [] };
                }
                database.factions[faction][category].push(item);
            }
        }
        res.json(database);
    } catch (err) {
        console.error('Error fetching database:', err);
        res.status(500).json({ error: err.message });
    }
});

// Core DB saving helper shared between the API endpoint and the startup seeding routine
async function saveDatabasePayload(payload) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('TRUNCATE TABLE battle_profiles CASCADE');
        
        const insertQuery = `
            INSERT INTO battle_profiles (category, faction, name, unit_size, points, points_raw, base_size, options_or_keywords, notes, raw_lines)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `;
        
        // Factions
        if (payload.factions) {
            for (const [factionName, factionData] of Object.entries(payload.factions)) {
                for (const cat of ['heroes', 'units', 'auxiliary']) {
                    if (factionData[cat]) {
                        for (const item of factionData[cat]) {
                            await client.query(insertQuery, [
                                cat,
                                factionName,
                                item.name,
                                item.unit_size || 1,
                                item.points || 0,
                                item.points_raw || String(item.points || 0),
                                item.base_size || '',
                                item.options_or_keywords || '',
                                item.notes || '',
                                JSON.stringify(item.raw_lines || [])
                            ]);
                        }
                    }
                }
            }
        }
        
        // Regiments of Renown
        if (payload.regiments_of_renown) {
            for (const item of payload.regiments_of_renown) {
                await client.query(insertQuery, [
                    'regiments_of_renown',
                    'GLOBAL',
                    item.name,
                    item.unit_size || 1,
                    item.points || 0,
                    item.points_raw || String(item.points || 0),
                    item.base_size || '',
                    item.options_or_keywords || '',
                    item.notes || '',
                    JSON.stringify(item.raw_lines || [])
                ]);
            }
        }
        
        // Manifestations
        if (payload.manifestations) {
            for (const item of payload.manifestations) {
                await client.query(insertQuery, [
                    'manifestations',
                    'GLOBAL',
                    item.name,
                    item.unit_size || 1,
                    item.points || 0,
                    item.points_raw || String(item.points || 0),
                    item.base_size || '',
                    item.options_or_keywords || '',
                    item.notes || '',
                    JSON.stringify(item.raw_lines || [])
                ]);
            }
        }
        
        // Legends
        if (payload.legends) {
            for (const [factionName, legendData] of Object.entries(payload.legends)) {
                for (const cat of ['heroes', 'units']) {
                    if (legendData[cat]) {
                        for (const item of legendData[cat]) {
                            await client.query(insertQuery, [
                                `legends_${cat}`,
                                factionName,
                                item.name,
                                item.unit_size || 1,
                                item.points || 0,
                                item.points_raw || String(item.points || 0),
                                item.base_size || '',
                                item.options_or_keywords || '',
                                item.notes || '',
                                JSON.stringify(item.raw_lines || [])
                            ]);
                        }
                    }
                }
            }
        }
        
        await client.query('COMMIT');
        return { success: true, message: 'Database successfully written to PostgreSQL.' };
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error writing database:', err);
        throw err;
    } finally {
        client.release();
    }
}

// POST database endpoint: receives a new JSON rules document, and triggers transaction saving
app.post('/api/database', async (req, res) => {
    const payload = req.body;
    if (!payload || (!payload.factions && !payload.regiments_of_renown && !payload.manifestations)) {
        return res.status(400).json({ error: 'Invalid database payload' });
    }
    try {
        const result = await saveDatabasePayload(payload);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Core Migration and Database Setup routine
async function initDatabaseSchema() {
    try {
        console.log('Initializing database schema inside Postgres...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS battle_profiles (
                id SERIAL PRIMARY KEY,
                category VARCHAR(50) NOT NULL,
                faction VARCHAR(100) NOT NULL,
                name VARCHAR(150) NOT NULL,
                unit_size INT DEFAULT 1,
                points INT DEFAULT 0,
                points_raw VARCHAR(50),
                base_size VARCHAR(50),
                options_or_keywords TEXT,
                notes TEXT,
                raw_lines JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE INDEX IF NOT EXISTS idx_profiles_faction ON battle_profiles(faction);
            CREATE INDEX IF NOT EXISTS idx_profiles_category ON battle_profiles(category);
        `);
        console.log('PostgreSQL schema verified successfully.');
        
        // Self-seeding: Check if the table is completely empty, and if so load from battle_profiles.json
        const countRes = await pool.query('SELECT COUNT(*) FROM battle_profiles');
        if (parseInt(countRes.rows[0].count) === 0) {
            console.log('Database empty! Reading default json profiles for self-seeding...');
            const defaultJsonPath = path.join(__dirname, 'battle_profiles.json');
            
            if (fs.existsSync(defaultJsonPath)) {
                const defaultRaw = fs.readFileSync(defaultJsonPath, 'utf8');
                const defaultProfiles = JSON.parse(defaultRaw);
                
                // Invoke seed process
                console.log('Seeding profiles table now...');
                const seedResult = await saveDatabasePayload(defaultProfiles);
                console.log('Seeding completed successfully:', seedResult.message);
            } else {
                console.warn('battle_profiles.json not found! Empty schema initialized but not seeded.');
            }
        } else {
            console.log(`Database already has ${countRes.rows[0].count} rows. Skipping seeding.`);
        }
    } catch (err) {
        console.error('Failed to initialize database schema:', err);
    }
}

// Start API Server
app.listen(PORT, async () => {
    console.log(`Server listening on port ${PORT}...`);
    // Seed and initialize DB after server is running
    await initDatabaseSchema();
});
