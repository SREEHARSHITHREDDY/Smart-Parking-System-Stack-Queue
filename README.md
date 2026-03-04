# Smart Parking System (Stack & Queue Based)

## Overview

This project simulates a Smart Parking System implemented in Python using fundamental Data Structures (Stack and Queue).
The system manages vehicle entry, parking allocation, exit processing, and billing while maintaining an organized parking layout.

The project demonstrates practical usage of Data Structures, Object-Oriented Programming, and modular software design.


## Features
	•	Vehicle Parking using Stack
	•	Vehicles are parked using stack logic to simulate realistic parking constraints.
	•	Waiting Queue using Queue
	•	If the parking lot becomes full, vehicles are placed in a waiting queue.
	•	Ticket-Based Parking System
	•	Each vehicle receives a unique Ticket ID upon entry.
	•	Vehicle Exit using Ticket ID or Vehicle Number
	•	Vehicles can exit by providing either identifier.
	•	Parking Blueprint Visualization
	•	Displays the parking layout with occupied and empty slots.
	•	Automatic Billing System
	•	Calculates parking fees based on parking duration.
	•	Vehicle Number Validation
	•	Ensures valid vehicle number format before entry.
	•	Sensor Simulation
	•	Simulates slot occupancy detection.
	•	Persistent Data Storage
	•	Parking data is stored using JSON so the system can resume previous state.
	•	Menu Driven Interface
	•	Simple terminal-based interface for easy interaction.


## Technologies Used
	•	Python
	•	Object-Oriented Programming (OOP)
	•	Stack Data Structure
	•	Queue Data Structure
	•	JSON File Handling
	•	Modular Python Architecture


## Project Structure
smart-parking-system
│
├── core
│   ├── parking_lot.py
│   ├── billing.py
│   ├── sensor.py
│   └── utils.py
│
├── models
│   └── vehicle.py
│
├── storage
│   └── file_handler.py
│
├── data
│   └── parking_data.json
│
└── main.py

## How to Run
Clone the repository and run the project:
git clone https://github.com/SREEHARSHITHREDDY/Smart-Parking-System-Stack-Queue.git
cd Smart-Parking-System-Stack-Queue/smart-parking-system
python main.py

## Example Output
------ ENTRY TICKET ------
Ticket ID : 8F3A91B2
Vehicle   : TS09AB1234
Slot      : A1
Entry Time: 14:30:22
--------------------------
------ EXIT RECEIPT ------
Ticket ID : 8F3A91B2
Vehicle   : TS09AB1234
Slot      : A1
Amount    : ₹20
--------------------------

## Future Improvements
	•	GUI Integration (Tkinter / PyQt)
	•	Database Integration (MySQL / MongoDB)
	•	Web-based Parking Dashboard
	•	AI-based Smart Parking Allocation
	•	IoT Sensor Integration
	•	Real-time Parking Analytics

⸻

# Author

Sree Harshith Reddy