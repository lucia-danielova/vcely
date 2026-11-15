export function sprayLevel(temp, wind) {
    const beeActive = temp >= 12;
    if (wind > 5 || (beeActive && wind > 4 && temp >= 20)) return 'banned';
    if (wind > 3 || temp > 25 || temp < 5 || (beeActive && wind > 3)) return 'caution';
    return 'safe';
}

export function canFly(temp, wind) {
    return temp >= 12 && wind <= 8;
}

export function contiguousWindows(hours, predicate) {
    const windows = [];
    let start = null;
    let end = null;
    hours.forEach((row, index) => {
        if (!predicate(row)) return;
        if (start == null) start = row.hour;
        end = row.hour;
        const next = hours[index + 1];
        if (!next || !predicate(next)) {
            windows.push(start === end ? `${start}:00` : `${start}:00–${end}:00`);
            start = null;
            end = null;
        }
    });
    return windows;
}

export function describeForecastWindows(hours) {
    const spray = contiguousWindows(hours, (row) => row.level === 'safe');
    const flight = contiguousWindows(hours, (row) => canFly(row.temp, row.wind));
    const sprayText = spray.length ? `Postrek: ${spray.join(', ')}` : 'Postrek: žiadne bezpečné okno';
    const flightText = flight.length ? `Let včiel: ${flight.join(', ')}` : 'Let včiel: žiadne okno';
    return {
        spray,
        flight,
        caption: `${sprayText} · ${flightText}`
    };
}
