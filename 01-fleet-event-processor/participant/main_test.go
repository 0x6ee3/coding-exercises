package main

import (
	"reflect"
	"testing"

	"github.com/goccy/go-json"
)

func TestPayloadFieldsAreSelectedByEventType(t *testing.T) {
	var request Request
	err := json.Unmarshal([]byte(`{"requestId":"payload-selection","events":[
		{"eventId":"a","vehicleId":"v","timestamp":1,"type":"location","latitude":52,"longitude":13,"percentage":-1,"status":"broken"},
		{"eventId":"b","vehicleId":"v","timestamp":2,"type":"battery","percentage":0,"latitude":999,"longitude":999,"status":"broken"},
		{"eventId":"c","vehicleId":"v","timestamp":3,"type":"status","status":"charging","percentage":999,"latitude":999,"longitude":999}
	]}`), &request)
	if err != nil {
		t.Fatal(err)
	}
	battery, status := 0.0, "charging"
	want := Response{RequestID: "payload-selection", Vehicles: []*Vehicle{{
		VehicleID: "v", Location: &Coordinates{Latitude: 52, Longitude: 13},
		Battery: &battery, Status: &status, LastSeen: 3,
	}}}
	if got := reconstruct(request); !reflect.DeepEqual(got, want) {
		t.Fatalf("got %#v, want %#v", got, want)
	}
}
