import React, { useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

type Tab = 'privacy' | 'terms';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Body({ children }: { children: string }) {
  return <Text style={styles.body}>{children}</Text>;
}

function BulletList({ items }: { items: string[] }) {
  return (
    <View style={styles.bulletList}>
      {items.map((item, i) => (
        <View key={i} style={styles.bulletRow}>
          <Text style={styles.bullet}>•</Text>
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function PrivacyContent() {
  return (
    <>
      <Section title="Responsable del tratamiento">
        <Body>
          Área Camper Marchuquera es responsable del tratamiento de los datos personales
          recogidos a través de esta aplicación. Para cualquier consulta sobre privacidad,
          puedes contactar con nosotros a través del correo electrónico disponible en el
          recinto.
        </Body>
      </Section>

      <Section title="Datos que recopilamos">
        <Body>Para gestionar tu reserva tratamos los siguientes datos:</Body>
        <BulletList
          items={[
            'Nombre y apellidos',
            'Correo electrónico',
            'Número de teléfono',
            'DNI/NIE',
            'Datos del vehículo (marca, modelo, matrícula, longitud)',
            'Historial de reservas y pagos',
          ]}
        />
      </Section>

      <Section title="Finalidad y base jurídica">
        <Body>
          Los datos se tratan para ejecutar el contrato de reserva y prestación del servicio
          (art. 6.1.b RGPD). No utilizamos tus datos con fines publicitarios ni los cedemos
          a terceros sin tu consentimiento, salvo las excepciones indicadas a continuación.
        </Body>
      </Section>

      <Section title="Proveedores de servicio">
        <Body>
          Para ofrecer el servicio colaboramos con los siguientes terceros:
        </Body>
        <BulletList
          items={[
            'Stripe: procesador de pagos. Gestiona los datos de tarjeta de forma segura. No almacenamos datos de pago en nuestros servidores.',
            'Supabase: proveedor de base de datos y autenticación, alojado en la Unión Europea (región eu-west-3).',
          ]}
        />
      </Section>

      <Section title="Conservación de datos">
        <Body>
          Los datos se conservan durante la vigencia de la relación contractual y,
          con posterioridad, durante los plazos legalmente exigidos por la normativa
          fiscal y mercantil aplicable.
        </Body>
      </Section>

      <Section title="Tus derechos (RGPD)">
        <Body>
          Conforme al Reglamento General de Protección de Datos, tienes derecho a:
        </Body>
        <BulletList
          items={[
            'Acceder a tus datos personales',
            'Rectificar datos inexactos',
            'Solicitar la supresión de tus datos',
            'Limitar u oponerte al tratamiento',
            'Solicitar la portabilidad de tus datos',
          ]}
        />
        <Body>
          Puedes ejercer estos derechos contactando con nosotros directamente en el recinto
          o a través de la dirección de correo electrónico habilitada al efecto.
        </Body>
      </Section>

      <Section title="Seguridad">
        <Body>
          Aplicamos medidas técnicas y organizativas adecuadas para proteger tus datos
          frente a accesos no autorizados, pérdida o divulgación accidental.
        </Body>
      </Section>
    </>
  );
}

function TermsContent() {
  return (
    <>
      <Section title="1. Objeto">
        <Body>
          La aplicación Área Camper Marchuquera permite realizar reservas de plazas de
          autocaravana y gestionar el acceso al recinto mediante código QR.
        </Body>
      </Section>

      <Section title="2. Proceso de reserva">
        <Body>
          La reserva queda confirmada una vez completado el pago a través de Stripe.
          Recibirás un código QR de acceso válido durante el periodo reservado. El sistema
          asigna automáticamente las plazas disponibles en las fechas seleccionadas.
        </Body>
      </Section>

      <Section title="3. Precios">
        <Body>
          El precio por noche se muestra en la pantalla de reserva antes de confirmar el
          pago. Los servicios adicionales (extras) tienen un precio independiente que
          también se indica antes de finalizar la compra. Todos los precios incluyen IVA.
        </Body>
      </Section>

      <Section title="4. Política de cancelación">
        <Body>
          Puedes cancelar tu reserva desde la aplicación. El reembolso aplicado depende
          del tiempo restante hasta la fecha de entrada:
        </Body>
        <BulletList
          items={[
            'Más de 7 días antes: reembolso del 100 %',
            'Entre 1 y 7 días antes: reembolso del 50 %',
            'Menos de 24 horas antes: sin reembolso',
          ]}
        />
        <Body>
          Los reembolsos se procesan a través de Stripe y pueden tardar entre 5 y 10 días
          hábiles en reflejarse en tu cuenta.
        </Body>
      </Section>

      <Section title="5. Modificaciones de reserva">
        <Body>
          Puedes modificar tu reserva (fechas, extras y vehículo) antes de la fecha de
          entrada. Si el nuevo importe es superior al original, se cobrará la diferencia
          mediante un nuevo proceso de pago. Si es inferior, se reembolsará la diferencia
          conforme a la política de cancelación vigente.
        </Body>
      </Section>

      <Section title="6. Obligaciones del usuario">
        <BulletList
          items={[
            'Utilizar únicamente la plaza asignada.',
            'Respetar las normas internas del recinto (silencio nocturno, gestión de residuos, etc.).',
            'Proporcionar datos verídicos durante el registro y la reserva.',
            'El acceso al recinto se realiza exclusivamente con el código QR facilitado.',
            'Comunicar cualquier incidencia al personal del área.',
          ]}
        />
      </Section>

      <Section title="7. Responsabilidad">
        <Body>
          El Área Camper Marchuquera no se responsabiliza de los daños que puedan sufrir
          los vehículos o las pertenencias personales dentro del recinto, salvo que sean
          consecuencia directa de una negligencia imputable al Área. El usuario es
          responsable del correcto uso de las instalaciones.
        </Body>
      </Section>

      <Section title="8. Modificaciones de los términos">
        <Body>
          Nos reservamos el derecho a modificar estos términos y condiciones. Los cambios
          relevantes se notificarán con antelación razonable a través de la aplicación.
          El uso continuado del servicio tras la notificación implica la aceptación de
          los nuevos términos.
        </Body>
      </Section>

      <Section title="9. Legislación aplicable">
        <Body>
          Estos términos se rigen por la legislación española. Para cualquier controversia
          derivada de su interpretación o cumplimiento, las partes se someten a los
          juzgados y tribunales del domicilio del usuario, salvo que la normativa
          aplicable establezca otro fuero imperativo.
        </Body>
      </Section>
    </>
  );
}

export default function ProfilePrivacy() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('privacy');

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerSide}>
          <Text style={styles.headerBack}>‹ Atrás</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Política y privacidad</Text>
        <View style={styles.headerSide} />
      </View>

      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, activeTab === 'privacy' && styles.tabActive]}
          onPress={() => setActiveTab('privacy')}
        >
          <Text style={[styles.tabText, activeTab === 'privacy' && styles.tabTextActive]}>
            Privacidad
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'terms' && styles.tabActive]}
          onPress={() => setActiveTab('terms')}
        >
          <Text style={[styles.tabText, activeTab === 'terms' && styles.tabTextActive]}>
            Términos
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {activeTab === 'privacy' ? <PrivacyContent /> : <TermsContent />}
        <Text style={styles.lastUpdated}>Última actualización: mayo de 2025</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f2f2f7' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  headerSide: { width: 70 },
  headerBack: { color: '#007AFF', fontSize: 16 },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#111' },

  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f2f2f7',
    alignItems: 'center',
  },
  tabActive: { backgroundColor: '#007AFF' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#555' },
  tabTextActive: { color: '#fff' },

  container: { padding: 16, paddingBottom: 48, gap: 12 },

  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111',
    marginBottom: 2,
  },
  body: {
    fontSize: 14,
    color: '#444',
    lineHeight: 21,
  },

  bulletList: { gap: 6, paddingLeft: 4 },
  bulletRow: { flexDirection: 'row', gap: 8 },
  bullet: { fontSize: 14, color: '#007AFF', lineHeight: 21, width: 12 },
  bulletText: { fontSize: 14, color: '#444', lineHeight: 21, flex: 1 },

  lastUpdated: {
    textAlign: 'center',
    fontSize: 12,
    color: '#aaa',
    marginTop: 8,
  },
});
