import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import dayjs from 'dayjs';
import {
  Calendar,
  useDateRange,
  type CalendarTheme,
} from '@marceloterreiro/flash-calendar';

/* === Tema negro/blanco seguro === */
const BLACK = '#000';
const WHITE = '#fff';
const MUTED = 'rgba(0,0,0,0.55)';
const DIVIDER = 'rgba(0,0,0,0.08)';

export const blackOnWhiteTheme: CalendarTheme = {
  rowMonth: {
    content: { color: BLACK, fontWeight: '700', textAlign: 'center' },
  },
  itemWeekName: { content: { color: MUTED, fontWeight: '600' } },
  rowWeek: {
    container: {
      borderBottomWidth: 1,
      borderBottomColor: DIVIDER,
      borderStyle: 'solid',
    },
  },
  itemDayContainer: { activeDayFiller: { backgroundColor: BLACK } },
  itemDay: {
    idle: ({ isWeekend }) => ({
      container: { backgroundColor: 'transparent', borderRadius: 6 },
      content: { color: isWeekend ? BLACK : BLACK },
    }),
    today: ({ isPressed }) => ({
      container: {
        borderColor: MUTED,
        borderWidth: 3,
        borderRadius: isPressed ? 6 : 16,
        backgroundColor: isPressed ? BLACK : 'transparent',
      },
      content: { color: isPressed ? WHITE : BLACK },
    }),
    active: ({ isStartOfRange, isEndOfRange }) => ({
      container: {
        backgroundColor: BLACK,
        borderTopLeftRadius: isStartOfRange ? 6 : 0,
        borderBottomLeftRadius: isStartOfRange ? 6 : 0,
        borderTopRightRadius: isEndOfRange ? 6 : 0,
        borderBottomRightRadius: isEndOfRange ? 6 : 0,
      },
      content: { color: WHITE },
    }),
    disabled: () => ({
      container: { backgroundColor: 'transparent' },
      content: { color: 'rgba(0,0,0,0.25)' },
    }),
  },
};
/* === fin tema === */

type Props = {
  minDate?: string; // YYYY-MM-DD
  maxDate?: string; // YYYY-MM-DD
  onChange: (range: { startId?: string; endId?: string }) => void;
  monthsWindow?: number; // por defecto 12
};

export default function CalendarRangePaged({
  minDate,
  maxDate,
  onChange,
  monthsWindow = 12,
}: Props) {
  // Hook oficial de rango
  const { onCalendarDayPress, dateRange, isDateRangeValid, onClearDateRange } =
    useDateRange();

  // Ventana de meses (rodante): hoy .. +N-1 meses
  const today = dayjs().startOf('day');
  const windowStart = useMemo(() => dayjs(minDate ?? today), [minDate, today]);
  const windowEnd = useMemo(
    () => dayjs(maxDate ?? today.add(monthsWindow - 1, 'month').endOf('month')),
    [maxDate, today, monthsWindow],
  );

  // Estado: mes visible (paginado), empieza en el inicio de la ventana
  const [monthCursor, setMonthCursor] = useState(windowStart.startOf('month'));
  const monthId = useMemo(
    () => monthCursor.format('YYYY-MM-DD'),
    [monthCursor],
  );

  // Evita bucles al propagar el rango
  const last = useRef<{ startId?: string; endId?: string }>({});
  const startId = dateRange?.startId;
  const endId = dateRange?.endId;

  useEffect(() => {
    if (isDateRangeValid) {
      if (last.current.startId !== startId || last.current.endId !== endId) {
        last.current = { startId, endId };
        onChange({ startId, endId });
      }
    } else {
      // si antes había algo y ahora es inválido -> limpia en el padre
      if (last.current.startId || last.current.endId) {
        last.current = {};
        onChange({ startId: undefined, endId: undefined });
      }
    }
  }, [isDateRangeValid, startId, endId, onChange]);

  const selectionKey = `${startId ?? ''}-${endId ?? startId ?? ''}`;

  // Controles Prev/Sig con límites de ventana
  const atStart =
    monthCursor.isSame(windowStart, 'month') ||
    monthCursor.isBefore(windowStart, 'month');
  const atEnd =
    monthCursor.isSame(windowEnd, 'month') ||
    monthCursor.isAfter(windowEnd, 'month');

  const activeRanges = useMemo(() => {
    if (startId && endId && isDateRangeValid) return [{ startId, endId }];
    if (startId && !endId) return [{ startId, endId: startId }]; // ← pinta el primer día
    return [];
  }, [isDateRangeValid, startId, endId]);

  return (
    <View style={{ flex: 1 }}>
      {/* Controles */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingBottom: 8,
          paddingHorizontal: 4,
        }}
      >
        <Pressable
          disabled={atStart}
          onPress={() =>
            !atStart && setMonthCursor((m) => m.subtract(1, 'month'))
          }
        >
          <Text style={{ opacity: atStart ? 0.3 : 1 }}>◀ Mes anterior</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            onClearDateRange(); /* padre se limpiará por el effect */
          }}
        >
          <Text style={{ color: '#2563eb' }}>Borrar</Text>
        </Pressable>
        <Pressable
          disabled={atEnd}
          onPress={() => !atEnd && setMonthCursor((m) => m.add(1, 'month'))}
        >
          <Text style={{ opacity: atEnd ? 0.3 : 1 }}>Mes siguiente ▶</Text>
        </Pressable>
      </View>

      <Calendar
        key={`${monthId}-${selectionKey}`} /* 👈 fuerza rerender al seleccionar */
        calendarMonthId={monthId}
        calendarFirstDayOfWeek="monday"
        calendarMinDateId={today.format('YYYY-MM-DD')}
        calendarMaxDateId={windowEnd.format('YYYY-MM-DD')}
        calendarActiveDateRanges={activeRanges}
        onCalendarDayPress={onCalendarDayPress}
        calendarDayHeight={34}
        theme={blackOnWhiteTheme}
      />
    </View>
  );
}
