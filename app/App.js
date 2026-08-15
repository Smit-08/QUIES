import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

import HomeScreen from './src/screens/HomeScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import EvidenceVaultScreen from './src/screens/EvidenceVaultScreen';
import RiskScoreScreen from './src/screens/RiskScoreScreen';
import AssistantScreen from './src/screens/AssistantScreen';

const Stack = createStackNavigator();

export default function App() {
    return (
        <NavigationContainer>
            <Stack.Navigator initialRouteName="Home">
                <Stack.Screen name="Home" component={HomeScreen} />
                <Stack.Screen name="Dashboard" component={DashboardScreen} />
                <Stack.Screen name="EvidenceVault" component={EvidenceVaultScreen} />
                <Stack.Screen name="RiskScore" component={RiskScoreScreen} />
                <Stack.Screen name="Assistant" component={AssistantScreen} />
            </Stack.Navigator>
        </NavigationContainer>
    );
}