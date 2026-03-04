class ParkingLot:
    def __init__(self, rows, cols):
        self.rows = rows
        self.cols = cols
        self.capacity = rows * cols
        self.layout = {}
        self.stack = []
        self.revenue = 0
        self._create_blueprint()

    def _create_blueprint(self):
        for r in range(self.rows):
            for c in range(self.cols):
                slot = f"{chr(65+r)}{c+1}"
                self.layout[slot] = {"status": "empty", "vehicle": None}

    def find_empty_slot(self):
        for slot, info in self.layout.items():
            if info["status"] == "empty":
                return slot
        return None