export abstract class Placeholder {
    constructor(props) {
    }

    public abstract leaveItToBrian();
    public doIt(){
        return this.leaveItToBrian();
    }

}

export class Place extends Placeholder {

    constructor(props) {
        super(props);

    }

    public leaveItToBrian() {
        return true;
    }


}