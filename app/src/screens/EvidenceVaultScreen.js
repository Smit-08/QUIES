import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function EvidenceVaultScreen() {
    return (
        <View style={styles.container}>
            <Text style={styles.text}>Evidence Vault</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f0f0f' },
    text: { fontSize: 24, color: '#fff' },
});