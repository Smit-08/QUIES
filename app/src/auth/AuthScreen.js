import React, { useState } from 'react';
import { View, TextInput, Button, Text } from 'react-native';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import apiClient from '../api/client';

export default function AuthScreen({ navigation }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSignIn = async () => {
        try {
            const auth = getAuth();
            await signInWithEmailAndPassword(auth, email, password);
            await apiClient.post('/auth/sync');
            navigation.navigate('Dashboard');
        } catch (e) { setError(e.message); }
    };

    const handleSignUp = async () => {
        try {
            const auth = getAuth();
            await createUserWithEmailAndPassword(auth, email, password);
            await apiClient.post('/auth/sync');
            navigation.navigate('Dashboard');
        } catch (e) { setError(e.message); }
    };

    return (
        <View style={{ padding: 20 }}>
            <Text>Email</Text>
            <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" style={{ borderWidth: 1, marginBottom: 10, padding: 8 }} />
            <Text>Password</Text>
            <TextInput value={password} onChangeText={setPassword} secureTextEntry style={{ borderWidth: 1, marginBottom: 10, padding: 8 }} />
            {error ? <Text style={{ color: 'red' }}>{error}</Text> : null}
            <Button title="Sign In" onPress={handleSignIn} />
            <Button title="Sign Up" onPress={handleSignUp} />
        </View>
    );
}