package com.sandveldveedienste.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PairingStorePlugin.class);
        super.onCreate(savedInstanceState);
        getBridge().setWebViewClient(new PinningWebViewClient(getBridge()));
    }
}
