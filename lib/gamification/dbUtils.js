// @ts-nocheck
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system";
import * as SQLite from "expo-sqlite";

const Levels = [
  { title: "Recycling Rookie", points: 0 },
  { title: "Eco Warrior", points: 5 },
  { title: "Eco Champion", points: 10 },
  { title: "Eco Master", points: 20 },
  { title: "Eco Legend", points: 40 },
  { title: "Eco God", points: 80 },
];

async function openDatabase() {
  if (
    !(await FileSystem.getInfoAsync(FileSystem.documentDirectory + "SQLite"))
      .exists
  ) {
    await FileSystem.makeDirectoryAsync(
      FileSystem.documentDirectory + "SQLite"
    );
  }

  if (
    !(
      await FileSystem.getInfoAsync(
        FileSystem.documentDirectory + "SQLite/recyclevision.db"
      )
    ).exists
  ) {
    await FileSystem.downloadAsync(
      Asset.fromModule(require("@/assets/data/defaultDb.db")).uri,
      FileSystem.documentDirectory + "SQLite/recyclevision.db"
    );
  }

  return SQLite.openDatabase("recyclevision.db");
}

async function executeSql(sql, params = []) {
  const db = await openDatabase();
  const allResults = await db.execAsync([{ sql, args: params }], false);
  // console.log(sql, params, allResults);
  if (allResults.length > 0) {
    return allResults[0];
  } else {
    return { rows: [] };
  }
}

async function insertNewScan(result) {
  // console.log("INSERTING INTO DB", result);
  const { rowsAffected } = await executeSql(
    `INSERT INTO scans (time_of_scan, result) VALUES (?, ?)`,
    [Date.now(), result]
  );
  return rowsAffected;
}

async function getNbrOfScans() {
  const { rows } = await executeSql(`SELECT COUNT(*) as count FROM scans`);
  // console.log(rows);
  return rows[0].count;
}

async function getScansPerDate() {
  // get the scans within the last 5 days
  const { rows } = await executeSql(
    `SELECT time_of_scan FROM scans WHERE time_of_scan > ?`,
    [Date.now() - 5 * 24 * 60 * 60 * 1000]
  );
  // console.log(rows);

  // return in format {labels: [dd/mm, dd/mm, ...], datasets: [{data: [nbrOfScans, nbrOfScans, ...], color: (opacity = 1) => `rgba(99, 66, 232, ${opacity})`}]}
  let labels = [];
  let datasets = [
    { data: [], color: (opacity = 1) => `rgba(99, 66, 232, ${opacity})` },
  ];

  for (let i = 4; i >= 0; i--) {
    let date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    labels.push(`${date.getDate()}/${date.getMonth() + 1}`);
    let count = 0;
    for (let row of rows) {
      let scanDate = new Date(row.time_of_scan);
      if (
        scanDate.getDate() === date.getDate() &&
        scanDate.getMonth() === date.getMonth()
      ) {
        count++;
      }
    }
    datasets[0].data.push(count);
  }

  return { labels, datasets };
}

async function getStreak() {
  const { rows } = await executeSql(
    `SELECT time_of_scan FROM scans ORDER BY time_of_scan DESC`
  );
  //console.log(rows);

  let today = new Date();
  let yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  today = new Date(today);
  yesterday = new Date(yesterday);

  let scanDates = rows.map((r) => new Date(r.time_of_scan));

  // Sort dates in ascending order
  scanDates.sort((a, b) => b - a);

  // console.log('scanDates', scanDates.map((d) => d.toLocaleDateString()));

  // Initialize variables
  let streak = 0;

  let compareDate = null;

  for (let i = 0; i < scanDates.length; i++) {
    // console.log('date', scanDates[i]);

    if (
      i === 0 &&
      scanDates[i].toLocaleDateString() !== today.toLocaleDateString() &&
      scanDates[i].toLocaleDateString() !== yesterday.toLocaleDateString()
    ) {
      // console.log('no streak');
      streak = 0;
      break;
    } else if (
      i === 0 &&
      (scanDates[i].toLocaleDateString() === today.toLocaleDateString() ||
        scanDates[i].toLocaleDateString() === yesterday.toLocaleDateString())
    ) {
      // console.log('streak starts today or yesterday');
      compareDate = scanDates[i];
      streak++;
    }

    const expectedDate = new Date(compareDate);
    expectedDate.setDate(compareDate.getDate() - 1);

    // make sure we didn't already see this date
    if (
      scanDates[i].toLocaleDateString() === compareDate.toLocaleDateString()
    ) {
      // console.log('date already seen');
      continue;
    }

    if (
      scanDates[i].toLocaleDateString() === expectedDate.toLocaleDateString()
    ) {
      compareDate = scanDates[i];
      streak++;
    } else {
      break;
    }
  }

  // console.log("Current scan streak:", streak);
  return streak;
}

async function getLevel() {
  const count = await getNbrOfScans();
  let level = -1;
  for (let i = 0; i < Levels.length; i++) {
    if (count >= Levels[i].points) {
      level = i;
    }
  }
  const currentTitle = level >= 0 ? Levels[level].title : "Recycling Rookie";
  return {
    currentTitle,
    nextTitle: Levels[level + 1].title,
    points: count,
    nextPoints: Levels[level + 1].points,
  };
}

const deleteDatabase = async () => {
  // console.log("deleting database");
  await FileSystem.deleteAsync(
    FileSystem.documentDirectory + "SQLite/recyclevision.db"
  );
};

// Get the number of scans for each type
async function getPieData() {
  const categories = [
    { name: "cardboard/paper", types: ["cardboard", "paper"] },
    { name: "metal/glass/plastic", types: ["metal", "glass", "plastic"] },
    { name: "organic", types: ["organic"] },
    { name: "trash", types: ["trash"] },
  ];
  let pieData = {};

  for (let category of categories) {
    let count = 0;
    for (let type of category.types) {
      const { rows } = await executeSql(
        `SELECT COUNT(*) as count FROM scans WHERE LOWER(result) = ?`,
        [type.toLowerCase()]
      );
      count += rows[0].count;
    }
    pieData[category.name] = count;
  }

  return pieData;
}

export {
  deleteDatabase,
  getLevel,
  getNbrOfScans,
  getPieData,
  getScansPerDate,
  getStreak,
  insertNewScan,
};
