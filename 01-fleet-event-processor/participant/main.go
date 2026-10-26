package main

import (
	"errors"
	"fmt"
	"io"
	"os"
	"slices"
	"strings"

	"github.com/goccy/go-json"
)

type EventHeader struct {
	EventID   string `json:"eventId"`
	VehicleID string `json:"vehicleId"`
	Timestamp int64  `json:"timestamp"`
	Type      string `json:"type"`
}

type Coordinates struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

type Event struct {
	EventHeader
	Percentage *float64 `json:"percentage"`
	Latitude   *float64 `json:"latitude"`
	Longitude  *float64 `json:"longitude"`
	Status     *string  `json:"status"`
}

// Only the payload selected by Type participates in validation or state updates.
func (event Event) valid() bool {
	switch event.Type {
	case "battery":
		return event.Percentage != nil && *event.Percentage >= 0 && *event.Percentage <= 100
	case "location":
		return event.Latitude != nil && event.Longitude != nil &&
			*event.Latitude >= -90 && *event.Latitude <= 90 &&
			*event.Longitude >= -180 && *event.Longitude <= 180
	case "status":
		if event.Status == nil {
			return false
		}
		switch *event.Status {
		case "available", "reserved", "driving", "charging", "maintenance":
			return true
		}
	}
	return false
}

type Request struct {
	RequestID string  `json:"requestId"`
	Events    []Event `json:"events"`
}

type Vehicle struct {
	VehicleID string       `json:"vehicleId"`
	Location  *Coordinates `json:"location"`
	Battery   *float64     `json:"battery"`
	Status    *string      `json:"status"`
	LastSeen  int64        `json:"lastSeen"`
}

type Response struct {
	RequestID string     `json:"requestId"`
	Vehicles  []*Vehicle `json:"vehicles"`
}

func reconstruct(request Request) Response {
	seen := make(map[string]struct{}, len(request.Events))
	events := request.Events[:0]
	for _, event := range request.Events {
		if _, duplicate := seen[event.EventID]; duplicate {
			continue
		}
		// Reserve the ID before validation, preserving first-arrival semantics.
		seen[event.EventID] = struct{}{}
		if event.valid() {
			events = append(events, event)
		}
	}

	slices.SortFunc(events, func(a, b Event) int {
		if a.Timestamp < b.Timestamp {
			return -1
		}
		if a.Timestamp > b.Timestamp {
			return 1
		}
		return strings.Compare(a.EventID, b.EventID)
	})

	vehicles := make(map[string]*Vehicle)
	for i := range events {
		event := &events[i]
		vehicle := vehicles[event.VehicleID]
		if vehicle == nil {
			vehicle = &Vehicle{VehicleID: event.VehicleID}
			vehicles[event.VehicleID] = vehicle
		}
		switch event.Type {
		case "battery":
			vehicle.Battery = event.Percentage
		case "location":
			vehicle.Location = &Coordinates{Latitude: *event.Latitude, Longitude: *event.Longitude}
		case "status":
			vehicle.Status = event.Status
		}
		vehicle.LastSeen = event.Timestamp
	}

	response := Response{RequestID: request.RequestID, Vehicles: make([]*Vehicle, 0, len(vehicles))}
	for _, vehicle := range vehicles {
		response.Vehicles = append(response.Vehicles, vehicle)
	}
	slices.SortFunc(response.Vehicles, func(a, b *Vehicle) int {
		return strings.Compare(a.VehicleID, b.VehicleID)
	})
	return response
}

func run() error {
	decoder := json.NewDecoder(os.Stdin)
	encoder := json.NewEncoder(os.Stdout)
	for {
		var request Request
		if err := decoder.Decode(&request); err != nil {
			if errors.Is(err, io.EOF) {
				return nil
			}
			return err
		}
		if err := encoder.Encode(reconstruct(request)); err != nil {
			return err
		}
	}
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
