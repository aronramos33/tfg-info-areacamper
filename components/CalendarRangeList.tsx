import React, { useEffect, useState, useRef } from 'react';
import { View } from 'react-native';
import { CalendarTheme } from '@marceloterreiro/flash-calendar';
// ⚠️ sigue la import de la doc
import {
  Calendar,
  useDateRange,
  toDateId,
} from '@marceloterreiro/flash-calendar';
import dayjs from 'dayjs';
import { fetchSoldOutDateIds } from '@/services/availability';

type Props = {
  // ventana de consulta y límites de selección
  minDate?: string; // YYYY-MM-DD
  maxDate?: string; // YYYY-MM-DD
  onChange: (range: { startId?: string; endId?: string }) => void;
};

export default function CalendarRangeList({
  minDate,
  maxDate,
  onChange,
}: Props) {
  const {
    calendarActiveDateRanges,
    onCalendarDayPress,
    dateRange,
    isDateRangeValid,
  } = useDateRange();

  const today = toDateId(new Date());
  const minId = minDate ?? today;
  const maxId = maxDate ?? toDateId(dayjs().add(24, 'month').toDate());

  const [disabledIds, setDisabledIds] = useState<string[]>([]);
  useEffect(() => {
    fetchSoldOutDateIds(
      minId,
      dayjs(maxId, 'YYYY-MM-DD').add(1, 'day').format('YYYY-MM-DD'),
    )
      .then(setDisabledIds)
      .catch(() => setDisabledIds([]));
  }, [minId, maxId]);

  // ▶️ solo dispara onChange cuando cambian los valores (no la referencia)
  const last = useRef<{ startId?: string; endId?: string }>({});
  const startId = dateRange?.startId;
  const endId = dateRange?.endId;

  useEffect(() => {
    if (!isDateRangeValid) return;
    if (last.current.startId !== startId || last.current.endId !== endId) {
      last.current = { startId, endId };
      onChange({ startId, endId });
    }
  }, [isDateRangeValid, startId, endId, onChange]);

  return (
    <View style={{ flex: 1 }}>
      <Calendar.List
        calendarFormatLocale="es"
        calendarDayHeight={30}
        calendarFirstDayOfWeek={'monday'}
        calendarMinDateId={minId}
        calendarMaxDateId={maxId}
        calendarDisabledDateIds={disabledIds}
        calendarActiveDateRanges={calendarActiveDateRanges}
        onCalendarDayPress={onCalendarDayPress}
        theme={blackOnWhiteTheme} // tema personalizado
      />
    </View>
  );
}
/* === Tema seguro (negro/blanco) === */
const BLACK = '#000000';
const WHITE = '#ffffff';
const MUTED = 'rgba(0,0,0,0.55)';
const DIVIDER = 'rgba(0,0,0,0.08)';

const blackOnWhiteTheme: CalendarTheme = {
  rowMonth: {
    content: { color: BLACK, fontWeight: '700', textAlign: 'center' },
  },
  itemWeekName: {
    content: { color: MUTED, fontWeight: '600' },
  },
  rowWeek: {
    container: {
      borderBottomWidth: 1,
      borderBottomColor: DIVIDER,
      borderStyle: 'solid',
    },
  },
  itemDayContainer: {
    // color de “relleno” del rango entre inicio y fin
    activeDayFiller: { backgroundColor: BLACK },
  },
  itemDay: {
    idle: ({ isWeekend }) => ({
      container: { backgroundColor: 'transparent', borderRadius: 6 },
      content: { color: isWeekend ? MUTED : BLACK },
    }),
    today: ({ isPressed }) => ({
      container: {
        borderColor: MUTED,
        borderWidth: 1,
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
    // ⚠️ en esta lib `disabled` debe ser FUNCIÓN que devuelva { container, content }
    disabled: () => ({
      container: { backgroundColor: 'transparent' },
      content: { color: 'rgba(0,0,0,0.25)' },
    }),
  },
};
/* === fin tema === */
