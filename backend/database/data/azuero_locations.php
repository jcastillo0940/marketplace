<?php

/**
 * División político-administrativa de Herrera, Los Santos, Coclé y Veraguas.
 * Fuente de referencia: INEC, División Político-Administrativa de la República de Panamá 2023.
 * Herrera y Los Santos verificados con cuadros de Lugares Poblados, Censos 2023.
 * Coclé y Veraguas: estructura distrital según INEC; corregimientos requieren
 * verificación final contra cuadros de Lugares Poblados 2023.
 * https://www.inec.gob.pa/archivos/P053342420240202111819Herrera.xlsx
 * https://www.inec.gob.pa/archivos/P0289562520240201164821Los%20Santos.xlsx
 */
return [
    'Herrera' => [
        'Chitré' => ['Chitré', 'La Arena', 'Monagrillo', 'Llano Bonito', 'San Juan Bautista'],
        'Las Minas' => ['Las Minas', 'Chepo', 'Chumical', 'El Toro', 'Leones', 'Quebrada del Rosario', 'Quebrada El Ciprián'],
        'Los Pozos' => ['Los Pozos', 'Capurí', 'El Calabacito', 'El Cedro', 'La Arena', 'La Pitaloza', 'Los Cerritos', 'Los Cerros de Paja', 'Las Llanas'],
        'Ocú' => ['Ocú', 'Cerro Largo', 'Los Llanos', 'Llano Grande', 'Peñas Chatas', 'El Tijera', 'Menchaca', 'Entradero del Castillo'],
        'Parita' => ['Parita', 'Cabuya', 'Los Castillos', 'Llano de La Cruz', 'París', 'Portobelillo', 'Potuga'],
        'Pesé' => ['Pesé', 'Las Cabras', 'El Pájaro', 'El Barrero', 'El Pedregoso', 'El Ciruelo', 'Sabana Grande', 'Rincón Hondo'],
        'Santa María' => ['Santa María', 'Chupampa', 'El Rincón', 'El Limón', 'Los Canelos'],
    ],
    'Los Santos' => [
        'Guararé' => ['Guararé', 'El Espinal', 'El Macano', 'Guararé Arriba', 'La Enea', 'La Pasera', 'Las Trancas', 'Llano Abajo', 'El Hato', 'Perales'],
        'Las Tablas' => ['Las Tablas', 'Bajo Corral', 'Bayano', 'El Carate', 'El Cocal', 'El Manantial', 'El Muñoz', 'El Pedregoso', 'La Laja', 'La Miel', 'La Palma', 'La Tiza', 'Las Palmitas', 'Las Tablas Abajo', 'Nuario', 'Palmira', 'Peña Blanca', 'Río Hondo', 'San José', 'San Miguel', 'Santo Domingo', 'Sesteadero', 'Valle Rico', 'Vallerriquito'],
        'Los Santos' => ['La Villa de Los Santos', 'El Guásimo', 'La Colorada', 'La Espigadilla', 'Las Cruces', 'Las Guabas', 'Los Ángeles', 'Los Olivos', 'Llano Largo', 'Sabana Grande', 'Santa Ana', 'Tres Quebradas', 'Agua Buena', 'Villa Lourdes', 'El Ejido'],
        'Macaracas' => ['Macaracas', 'Bahía Honda', 'Bajos de Güera', 'Corozal', 'Chupá', 'El Cedro', 'Espino Amarillo', 'La Mesa', 'Las Palmas', 'Llano de Piedra', 'Mogollón'],
        'Pedasí' => ['Pedasí', 'Los Asientos', 'Mariabé', 'Purio', 'Oria Arriba'],
        'Pocrí' => ['Pocrí', 'El Cañafístulo', 'Lajamina', 'Paraíso', 'Paritilla'],
        'Tonosí' => ['Tonosí', 'Altos de Güera', 'Cañas', 'El Bebedero', 'El Cacao', 'El Cortezo', 'Flores', 'Guánico', 'La Tronosa', 'Cambutal', 'Isla de Cañas'],
    ],
    'Coclé' => [
        'Aguadulce' => ['Aguadulce', 'El Limón', 'El Roble', 'Los Llanos', 'Pocrí', 'Río Grande'],
        'Antón' => ['Antón', 'El Chirú', 'El Valle', 'Juan Díaz', 'Llano Grande', 'Musquí', 'Río Hato'],
        'La Pintada' => ['El Copé', 'El Harino', 'La Loma', 'La Pintada', 'Llano Grande'],
        'Natá' => ['Capellanía', 'El Caño', 'Guzmán', 'Llanito', 'Natá'],
        'Olá' => ['El Picacho', 'Olá', 'Tulú'],
        'Penonomé' => ['Caimito', 'Coclé del Norte', 'El Coco', 'El Pedregoso', 'La Pava', 'Pajonal', 'Penonomé', 'Río Grande', 'Río Indio', 'Toabre', 'La Posada'],
    ],
    'Veraguas' => [
        'Atalaya' => ['Atalaya', 'Los Valles', 'Ponuga'],
        'Calobre' => ['Barnizal', 'Calobre', 'El Cacao', 'El Cocla', 'El Marañón', 'Las Guías', 'San Francisco'],
        'Cañazas' => ['Cañazas', 'El Aromillo', 'El Picador', 'Las Cruces', 'San José'],
        'La Mesa' => ['El Cuay', 'La Mesa', 'La Raya de Calobre', 'Llano Grande', 'Lucha Franco'],
        'Las Palmas' => ['Las Palmas', 'El Palmar', 'La Montañuela', 'Los Hatillos', 'Mariato', 'Quebrada de Oro', 'Quebro', 'San Martín de Porres'],
        'Montijo' => ['Gobea', 'Llano Grande', 'Montijo', 'Pilón', 'Quebrada de Oro', 'Trinidad'],
        'Río de Jesús' => ['Rodeo Viejo', 'Río de Jesús', 'San Pedro del Espino'],
        'San Francisco' => ['La Raya de Santa María', 'La Soledad', 'San Francisco', 'San José'],
        'Santa Fé' => ['Calovébora', 'El Alto', 'Gatú', 'Quebrada del Rosario', 'Santa Fé'],
        'Santiago' => ['La Colorada', 'La Peña', 'La Raya de la Arena', 'La Ye', 'Llano Grande', 'Ponuga', 'San Pedro', 'Santiago'],
        'Soná' => ['Cativé', 'La Colorada', 'La Soledad', 'La Tronosa', 'Quebrada de Oro', 'Rodeo Viejo', 'San José', 'San Pablo Viejo', 'Soná', 'Trinidad'],
        'Unión Chocó' => ['Gobernadora', 'Unión Chocó'],
    ],
];
