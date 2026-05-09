import React from 'react';
import { ScrollView, View, Text } from 'react-native';
import Svg, { Rect, Text as SvgText, G, Line } from 'react-native-svg';

interface Place {
  id: number;
  name: string;
}

interface Props {
  places: Place[];
  occupiedIds: Set<number>;
  selectedIds: number[];
  onToggle?: (id: number) => void;
  maintenanceIds?: Set<number>;
  blockOccupied?: boolean;
}

const SVG_W = 680;
const SVG_H = 210;
const SPOT_W = 44;
const SPOT_H = 65;
const SPOT_GAP = 1;
const SPOT_START_X = 34;
const TOP_Y = 8;
const BOT_Y = 137;

export default function ParkingMapPicker({
  places,
  occupiedIds,
  selectedIds,
  onToggle,
  maintenanceIds = new Set<number>(),
  blockOccupied = true,
}: Props) {
  const sorted = [...places].sort((a, b) => a.id - b.id);
  const topRow = sorted.slice(0, 14);
  const botRow = sorted.slice(14, 28);

  const spotColors = (id: number) => {
    if (maintenanceIds.has(id))
      return { fill: '#FEF3C7', stroke: '#F59E0B', text: '#92400E' };
    if (occupiedIds.has(id))
      return { fill: '#FEE2E2', stroke: '#E5E7EB', text: '#9CA3AF' };
    if (selectedIds.includes(id))
      return { fill: '#EAF1FE', stroke: '#1A73E8', text: '#1A73E8' };
    return { fill: '#E8F5E9', stroke: '#4CAF50', text: '#2E7D32' };
  };

  const renderSpot = (place: Place, colIndex: number, rowY: number) => {
    const x = SPOT_START_X + colIndex * (SPOT_W + SPOT_GAP);
    const colors = spotColors(place.id);
    const isBlocked =
      blockOccupied &&
      (occupiedIds.has(place.id) || maintenanceIds.has(place.id));
    const isSelected = selectedIds.includes(place.id);

    return (
      <G
        key={place.id}
        onPress={
          !isBlocked && onToggle ? () => onToggle(place.id) : undefined
        }
      >
        <Rect
          x={x}
          y={rowY}
          width={SPOT_W}
          height={SPOT_H}
          fill={colors.fill}
          stroke={colors.stroke}
          strokeWidth={isSelected ? 2.5 : 1}
          rx={4}
        />
        <SvgText
          x={x + SPOT_W / 2}
          y={rowY + SPOT_H / 2 + 5}
          fontSize={12}
          fontWeight="700"
          fill={colors.text}
          textAnchor="middle"
        >
          {'P' + place.id}
        </SvgText>
      </G>
    );
  };

  const showMaintLegend = !blockOccupied || maintenanceIds.size > 0;

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
      >
        <Svg width={SVG_W} height={SVG_H}>
          {/* Parking perimeter */}
          <Rect
            x={SPOT_START_X - 2}
            y={2}
            width={SVG_W - SPOT_START_X - 6}
            height={SVG_H - 4}
            fill="#F0F0EC"
            rx={6}
          />

          {/* Central road lane */}
          <Rect
            x={SPOT_START_X - 2}
            y={TOP_Y + SPOT_H}
            width={SVG_W - SPOT_START_X - 6}
            height={BOT_Y - (TOP_Y + SPOT_H)}
            fill="#E2E1DB"
          />

          {/* Pérgola (center-left) */}
          <Rect
            x={78}
            y={78}
            width={145}
            height={50}
            fill="#DDB89A"
            stroke="#B8845A"
            strokeWidth={1}
            rx={5}
          />
          <SvgText
            x={150}
            y={107}
            fontSize={10}
            fontWeight="700"
            fill="#7B4F2E"
            textAnchor="middle"
          >
            Pérgola
          </SvgText>

          {/* Módulos servicios (center-right) */}
          <Rect
            x={440}
            y={78}
            width={72}
            height={50}
            fill="#6B7280"
            stroke="#4B5563"
            strokeWidth={1}
            rx={4}
          />
          <Rect
            x={518}
            y={78}
            width={72}
            height={50}
            fill="#6B7280"
            stroke="#4B5563"
            strokeWidth={1}
            rx={4}
          />
          <SvgText
            x={516}
            y={107}
            fontSize={10}
            fontWeight="700"
            fill="#F9FAFB"
            textAnchor="middle"
          >
            Servicios
          </SvgText>

          {/* Entrada / Salida indicator */}
          <SvgText
            x={16}
            y={95}
            fontSize={7}
            fontWeight="700"
            fill="#9CA3AF"
            textAnchor="middle"
          >
            ENT
          </SvgText>
          <Line
            x1={16}
            y1={99}
            x2={16}
            y2={109}
            stroke="#D1D5DB"
            strokeWidth={1}
          />
          <SvgText
            x={16}
            y={116}
            fontSize={7}
            fontWeight="700"
            fill="#9CA3AF"
            textAnchor="middle"
          >
            SAL
          </SvgText>

          {/* Top row (places 1-14) */}
          {topRow.map((place, i) => renderSpot(place, i, TOP_Y))}

          {/* Bottom row (places 15-28) */}
          {botRow.map((place, i) => renderSpot(place, i, BOT_Y))}
        </Svg>
      </ScrollView>

      {/* Legend */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 12,
          marginTop: 10,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View
            style={{
              width: 12,
              height: 12,
              backgroundColor: '#E8F5E9',
              borderWidth: 1,
              borderColor: '#4CAF50',
              borderRadius: 2,
            }}
          />
          <Text style={{ fontSize: 12, color: '#6B7280' }}>Libre</Text>
        </View>
        {blockOccupied && onToggle && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View
              style={{
                width: 12,
                height: 12,
                backgroundColor: '#EAF1FE',
                borderWidth: 1.5,
                borderColor: '#1A73E8',
                borderRadius: 2,
              }}
            />
            <Text style={{ fontSize: 12, color: '#6B7280' }}>Seleccionada</Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View
            style={{
              width: 12,
              height: 12,
              backgroundColor: '#FEE2E2',
              borderWidth: 1,
              borderColor: '#E5E7EB',
              borderRadius: 2,
            }}
          />
          <Text style={{ fontSize: 12, color: '#6B7280' }}>Ocupada</Text>
        </View>
        {showMaintLegend && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View
              style={{
                width: 12,
                height: 12,
                backgroundColor: '#FEF3C7',
                borderWidth: 1,
                borderColor: '#F59E0B',
                borderRadius: 2,
              }}
            />
            <Text style={{ fontSize: 12, color: '#6B7280' }}>Mantenimiento</Text>
          </View>
        )}
      </View>
    </View>
  );
}
